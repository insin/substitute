var util = require('util')

var async = require('async')
  , express = require('express')
  , OAuth= require('oauth').OAuth
  , redis = require('redis').createClient()
  , RedisStore = require('connect-redis')(express)

var settings = require('./settings')
  , substitute = require('./index')
  , pluralise = require('./lib/util').pluralise

redis.on('error', function (err) {
  console.error('Redis Error: %s', err)
})

var oa = new OAuth(
  'https://api.twitter.com/oauth/request_token'
, 'https://api.twitter.com/oauth/access_token'
, settings.consumerKey
, settings.consumerSecret
, '1.0'
, settings.domain + '/auth/twitter/callback'
, 'HMAC-SHA1'
)

var app = express.createServer()
/** userId -> TweetScanner */
var scanners = {}

/**
 * Initialises a TweetScanner for each registered user.
 */
function initialiseScanners(cb) {
  redis.smembers('users', function(err, userIds) {
    if (err) {
      console.error('Error loading user ids: %s', err)
      return cb(err)
    }

    async.map(
      userIds
    , function(userId, cb) {
        redis.hgetall(util.format('user:%s', userId), function(err, user) {
          if (err) {
            return cb(err)
          }
          cb(null, user)
        })
      }
    , function(err, users) {
        if (err) {
          console.error('Error initialising scanners: %s', err)
          return cb(err)
        }
        users.forEach(createScanner)
        cb(null, users.length)
      }
    )
  })
}

/**
 * Initialises a TweetScanner for the given user.
 */
function createScanner(user) {
  scanners[user.id] = new substitute.TweetScanner(user.screenName, {
    consumer_key: settings.consumerKey
  , consumer_secret: settings.consumerSecret
  , access_token_key: user.accessKey
  , access_token_secret: user.accessSecret
  })
  return scanners[user.id]
}

// ---------------------------------------------------------- Express Config ---

// Use Jade as the default template engine
app.set('view engine', 'jade')
// Use template inheritance
app.set('view options', { layout: false })

/**
 * Middleware which loads user details when the current user is authenticated.
 */
function loadUser(req, res, next) {
  if (req.session.userId) {
    redis.hgetall(util.format('user:%s', req.session.userId), function(err, user) {
      if (err) {
        return next(
          new Error(util.format('Failed to load user: %s', req.session.userId))
        )
      }
      else {
        user.isAuthenticated = true
        req.user = user
        next()
      }
    })
  }
  else {
    req.user = {isAuthenticated: false}
    next()
  }
}

app.configure(function() {
  app.use(express.logger())
  app.use(express.bodyParser())
  app.use(express.cookieParser())
  app.use(express.session({ secret: settings.sessionSecret
                          , store: new RedisStore({client: redis}) }))
  app.use(loadUser)
  app.use(app.router)
  app.use(express.static(__dirname + '/static'))
  app.use(express.errorHandler({ showStack: true, dumpExceptions: true }))
})

// Add variables to the default template context
app.helpers({
  version: substitute.version
})
app.dynamicHelpers({
  user: function(req, res) {
    return req.user
  }
})

// ------------------------------------------------------------- URL Mapping ---

app.get('/',                       index)
app.get('/auth/twitter',           twitterAuth)
app.get('/auth/twitter/callback',  twitterAuthCallback)
app.get('/auth/signout',           signOut)
app.get('/controlpanel',           userControlPanel)
app.post('/controlpanel/stop',     stopScanner)
app.post('/controlpanel/start',    startScanner)
app.post('/controlpanel/interval', changePollInterval)
app.get('/expressions',            expressions)
app.all('/expressions/test',       testExpressions)

// Register a catch-all handler to render 404.jade
app.use(function(req, res, next) {
  res.render('404')
})

// ---------------------------------------------------------- View Functions ---

function index(req, res) {
  res.render('index')
}

function twitterAuth(req, res, next) {
  oa.getOAuthRequestToken(function(err, token, secret, results) {
    if (err) {
      console.error(err)
      return next(err)
    }
    req.session.oauth = { token: token, secret: secret }
    res.redirect('https://twitter.com/oauth/authenticate?oauth_token=' + token)
  })
}

function twitterAuthCallback(req, res, next) {
  if (!req.session.oauth) {
    return next(new Error('Twitter authorisation not in progress.'))
  }

  var oauth = req.session.oauth
  oa.getOAuthAccessToken(oauth.token, oauth.secret, req.query.oauth_verifier,
    function(err, accessKey, accessSecret, results) {
      if (err) {
        console.error(err)
        return next(err)
      }

      var userId = results.user_id
        , user = { id: userId
                 , screenName: results.screen_name
                 , accessKey: accessKey
                 , accessSecret: accessSecret }
      redis.sadd('users', userId)
      redis.hmset(util.format('user:%s', userId), user)
      req.session.userId = userId
      delete req.session.oauth
      if (!scanners.hasOwnProperty(userId)) {
        createScanner(user)
        console.info('Created new TweetScanner for %s', user.screenName)
      }
      res.redirect('/controlpanel')
    }
  )
}

function signOut(req, res, next) {
  if (!req.user.isAuthenticated) {
    return next(new Error('You must be signed in to sign out.'))
  }
  req.session.destroy(function(err) {
    res.redirect('/')
  })
}

function userControlPanel(req, res, next) {
  if (!req.user.isAuthenticated) {
    return next(new Error('You must be signed in to view this page.'))
  }
  // TODO Scanner settings Form for validation and redisplay
  res.render('controlpanel', {
    scanner: scanners[req.user.id]
  })
}

function stopScanner(req, res, next) {
  if (!req.user.isAuthenticated) {
    return next(new Error('You must be signed in to view this page.'))
  }
  var scanner = scanners[req.user.id]
  if (scanner.running) {
    scanner.stop()
    redis.set(util.format('scanner:%s', req.user.id), 'stopped')
  }
  res.redirect('/controlpanel')
}

function startScanner(req, res, next) {
  if (!req.user.isAuthenticated) {
    return next(new Error('You must be signed in to view this page.'))
  }
  var scanner = scanners[req.user.id]
  if (!scanner.running) {
    scanner.start()
    redis.set(util.format('scanner:%s', req.user.id), 'running')
  }
  res.redirect('/controlpanel')
}

function changePollInterval(req, res, next) {
  if (!req.user.isAuthenticated) {
    return next(new Error('You must be signed in to view this page.'))
  }
  var scanner = scanners[req.user.id]
  // TODO Scanner settings Form for validation and redisplay
  var pollInterval = parseInt(req.body.pollInterval, 10)
  if (pollInterval &&
      pollInterval % 1000 === 0 && // Whole seconds
      pollInterval >= 60000 &&     // 1 minute
      pollInterval <= 900000) {    // 15 minutes
    scanner.setPollInterval(pollInterval)
  }
  res.redirect('/controlpanel')
}

function expressions(req, res) {
  res.render('expressions')
}

function testExpressions(req, res) {
  // TODO
  res.render('testexpressions')
}

// ---------------------------------------------------------- Server Startup ---

initialiseScanners(function(err, count) {
  if (err) {
    return console.errror('Substitute server not started.')
  }
  console.info('Initialised %s TweetScanner%s', count, pluralise(count))
  app.listen(settings.port, '0.0.0.0')
  console.log('Substitute server listening on ' + settings.domain)
})
