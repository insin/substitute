var Twitter = require('ntwitter')
  , async = require('async')
  , fmt = require('isomorph/format').format

var SUB_REGEXP = /^s\/([^\/]+)\/([^\/]+)\/$/

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
function Substitute(user, auth, timeout) {
  this.user = user
  this.previousTweet = null

  this.twitter = new Twitter(auth)
  if (timeout) {
    this.start(timeout)
  }
}

/**
 * Loads the first batch of tweets and schedules regular loading of tweets at
 * the given interval (in ms).
 */
Substitute.prototype.start = function(timeout) {
  this.loadTweets()
  this.timeout = timeout || 60000
  this.interval = setInterval(this.loadTweets.bind(this), this.timeout)
}

/**
 * Unschedules regular loading of tweets.
 */
Substitute.prototype.stop = function() {
  clearInterval(this.interval)
}

/**
 * Loads tweets since the last tweet we examines and hands them off for
 * processing.
 */
Substitute.prototype.loadTweets = function() {
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
Substitute.prototype.processTweets = function(err, tweets) {
  if (err) {
    this.error(fmt('Error retrieving user timeline tweets: %s', err))
    return
  }
  this.log(fmt('Processing %s user timeline tweets...', tweets.length))

  async.forEachSeries(tweets.reverse(), this.processTweet.bind(this), function(err) {
    if (err) {
      this.error(fmt('Automatically stopping - error processing tweets: %s', err))
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
Substitute.prototype.processTweet = function(tweet, cb) {
  // Grab the previous tweet in case we need it and set the current tweet up
  // for the next tweet we examine.
  var previousTweet = this.previousTweet
  this.previousTweet = tweet

  // Is this the first tweet we've looked at? Is it the first tweet after a
  // substitution was performed? Doesn't matter - we're done.
  if (previousTweet == null) {
    return cb(null)
  }

  // If the tweet doesn't look like a substitution, we have nothing to do
  var match = SUB_REGEXP.exec(tweet.text)
  if (match == null) {
    return cb(null)
  }

  // If the previous tweet doesn't look like the substitution expression. we
  // can't do anything with it.
  var finder = new RegExp(match[1])
    , replacement = match[2]
  if (!finder.test(previousTweet.text)) {
    this.warn(fmt(
      "Found a substitution tweet [%s] but the prior tweet [%s] didn't match"
    , tweet.text
    , previousTweet.text))
    return cb(null)
  }

  // Perform the substitution on the target tweet, post a new tweet and delete
  // both tweets involved in the substitution.
  var correctedText = previousTweet.text.replace(finder, replacement)
  this.correctTweet(correctedText, previousTweet, tweet, cb)
}

Substitute.prototype.correctTweet = function(correctedText, originalTweet,
                                             substitutionTweet, cb) {
  async.series([
  // 1. Post the corrected tweet
    function(cb) {
      this.twitter.updateStatus(correctedText, {
        // TODO Carry over more fields from the original tweet if possible
        in_reply_to_status_id: originalTweet.in_reply_to_status_id_str
      }, cb)
    }.bind(this)
  // 2 & 3. Delete both existing tweets involved in the substitution
  , function(cb) {
      async.parallel([
        function(cb) {
          this.twitter.destroyStatus(originalTweet.id_str, cb)
        }.bind(this)
      , function(cb) {
          this.twitter.destroyStatus(substitutionTweet.id_str, cb)
        }.bind(this)
      ],
      // Deletion results should be [deleted1, deleted2]
      function(err, results) {
        if (err) {
          console.error(fmt('Error deleting substitition tweets: %s', err))
        }
        // Back to the outer async.series
        cb(err, results)
      }.bind(this))
    }.bind(this)
  ],
  // Overall results should be: [created, [deleted1, deleted2]]
  function(err, results) {
    if (err) {
      if (results.length == 0) {
        this.error(fmt('Error posting corrected tweet: %s', err))
      }
      // Back to caller with error
      return cb(err)
    }

    // We successfully corrected a tweet, so the next tweet won't be elibible
    // for use as a replacement.
    this.previousTweet = null
    // Back to caller with success
    cb(null)
  }.bind(this))
}

// Logging with prefixed information -------------------------------------------

Substitute.prototype.log = function(msg) {
  console.log(this._logMsg(msg))
}

Substitute.prototype.warn = function(msg) {
  console.warn(this._logMsg(msg))
}

Substitute.prototype.error = function(msg) {
  console.error(this._logMsg(msg))
}

Substitute.prototype._logMsg = function(msg) {
  return fmt('%s [%s] %s', new Date().toTimeString(), this.user, msg)
}

module.exports = Substitute
