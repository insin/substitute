var Twitter = require('ntwitter')
  , async = require('async')
  , util = require('util')

var expr = require('./expr')
  , pluralise = require('./util').pluralise

exports = module.exports = TweetScanner

/**
 * Scans a user's timeline for substitution tweets in "s/this/that/" format,
 * correcting the previous tweet using the replacement expression and deleting
 * the tweet with the typo and the tweet specifying the replacement.
 *
 * @param user the screen name of the user whose timeline is to be monitored.
 * @param auth an object containing authentication for a Twitter app with
 *     Read/Write access and the named user.
 * @param timeout if given, starts loading tweets immediately and schedules
 *     regular loading at the given interval (in ms).
 */
function TweetScanner(user, auth, timeout) {
  this.user = user
  this.previousTweet = null

  this.twitter = new Twitter(auth)
  if (timeout) {
    this.start(timeout)
  }
}

TweetScanner.DEBUG = false

/**
 * Loads the first batch of tweets and schedules regular loading of tweets at
 * the given interval (in ms).
 */
TweetScanner.prototype.start = function(timeout) {
  this.loadTweets()
  this.timeout = timeout || 60000
  this.interval = setInterval(this.loadTweets.bind(this), this.timeout)
}

/**
 * Unschedules regular loading of tweets.
 */
TweetScanner.prototype.stop = function() {
  clearInterval(this.interval)
}

/**
 * Loads tweets since the last tweet we examines and hands them off for
 * processing.
 */
TweetScanner.prototype.loadTweets = function() {
  var options = {
    screen_name: this.user
  , include_entities: 0, include_rts: 0 , trim_user: 1
  }
  if (this.previousTweet != null) {
    options.since_id = this.previousTweet.id_str
  }
  this.twitter.getUserTimeline(options, this.processTweets.bind(this))
}

/**
 * Hands invididual tweets off for processing.
 */
TweetScanner.prototype.processTweets = function(err, tweets) {
  if (err) {
    this.error('Error retrieving user timeline tweets: %s', err)
    return
  }
  this.info('Processing %s user timeline tweet%s...',
            tweets.length,
            pluralise(tweets.length))

  async.forEachSeries(tweets.reverse(), this.processTweet.bind(this), function(err) {
    if (err) {
      this.error('Automatically stopping - error processing tweets: %s', err)
      this.stop()
    }
  })
}

/**
 * Determines if a tweet is a substitution tweet. If so, determines if the
 * previous tweet in the timeline matches the substitution expression, posts a
 * new, corrected tweet and deletes both the substruction tweet and the tweet it
 * was used to correct.
 */
TweetScanner.prototype.processTweet = function(tweet, cb) {
  this.debug('[%s] %s', tweet.id_str, tweet.text)
  // Grab the previous tweet in case we need it and set the current tweet up
  // for the next tweet we examine.
  var previousTweet = this.previousTweet
  this.previousTweet = tweet

  // Is this the first tweet we've looked at? Is it the first tweet after a
  // substitution was performed? Doesn't matter - we're done.
  if (previousTweet == null) {
    this.debug('previousTweet is null')
    return cb(null)
  }

  // If the tweet doesn't look like a substitution, we have nothing to do
  if (!expr.isSubExpr(tweet.text)) {
    this.debug('tweet is not a substitution expression')
    return cb(null)
  }

  // Perform the substitution on the target tweet, post a new tweet and delete
  // both tweets involved in the substitution.
  var correctedText = expr.applySubExpr(tweet.text, previousTweet.text)
  if (correctedText == null) {
    this.warn(
      "Found a substitution tweet [%s] but the prior tweet [%s] didn't match"
    , tweet.text
    , previousTweet.text)
    return cb(null)
  }
  this.info('Correcting [%s] to [%s]', previousTweet.text, correctedText)
  this.correctTweet(correctedText, previousTweet, tweet, cb)
}

/**
 * Creates a new tweet and deletes the original and substitution tweet which
 * were used to create its text.
 * @param correctedText text for the new tweet.
 * @param originalTweet tweet date for the original tweet with the typo.
 * @param substitutionTweet tweet date for the substitution tweet.
 */
TweetScanner.prototype.correctTweet = function(correctedText, originalTweet,
                                               substitutionTweet, cb) {
  var scanner = this
  async.series([
  // 1. Post the corrected tweet
    function(cb) {
      scanner.debug('Updating status')
      scanner.twitter.updateStatus(correctedText, {
        // TODO Carry over more fields from the original tweet if possible
        in_reply_to_status_id: originalTweet.in_reply_to_status_id_str
      }, cb)
    }
  // 2 & 3. Delete both existing tweets involved in the substitution
  , function(cb) {
      async.parallel([
        function(cb) {
          scanner.debug('Deleting original tweet %s', originalTweet.id_str)
          scanner.twitter.destroyStatus(originalTweet.id_str, cb)
        }
      , function(cb) {
          scanner.debug('Deleting substitution tweet %s', substitutionTweet.id_str)
          scanner.twitter.destroyStatus(substitutionTweet.id_str, cb)
        }
      ],
      // Deletion results should be [deleted1, deleted2]
      function(err, results) {
        if (err) {
          scanner.error('Error deleting substitition tweets: %s', err)
        }
        // Back to the outer async.series
        cb(err, results)
      })
    }
  ],
  // Overall results should be: [created, [deleted1, deleted2]]
  function(err, results) {
    if (err) {
      if (results.length == 0) {
        scanner.error('Error posting corrected tweet: %s', err)
      }
      // Back to caller with error
      return cb(err)
    }

    // We successfully corrected a tweet, so the next tweet won't be eligible
    // for use as a replacement.
    scanner.previousTweet = null
    // Back to caller with success
    cb(null)
  })
}

// Logging with prefixed information -------------------------------------------

TweetScanner.prototype.debug = function(msg) {
  if (TweetScanner.DEBUG) {
    util.debug(util.format.apply(util, this._logMsgArgs(arguments)))
  }
}

TweetScanner.prototype.info = function(msg) {
  console.info.apply(console, (this._logMsgArgs(arguments)))
}

TweetScanner.prototype.warn = function(msg) {
  console.warn.apply(console, (this._logMsgArgs(arguments)))
}

TweetScanner.prototype.error = function(msg) {
  console.error.apply(console, (this._logMsgArgs(arguments)))
}

/**
 * Takes an arguments object where the expected arguments are
 * (logMessage[, format1, ...]) and creates an array of arguments for use with
 * one of Node's console functions which perform string formatting, prepending
 * logging of the current time and the twitter screen name.
 */
TweetScanner.prototype._logMsgArgs = function(args) {
  var formatArgs = ['%s [%s] ' + args[0], new Date().toTimeString(), this.user]
  if (args.length > 1) {
    formatArgs.push.apply(formatArgs, Array.prototype.slice.call(args, 1))
  }
  return formatArgs
}
