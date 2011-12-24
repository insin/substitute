var express = require('express')
  , OAuth= require('oauth').OAuth
  , RedisStore = require('connect-redis')(express)
  , settings = require('./settings')

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

app.configure(function() {
  app.use(app.router)
  app.use(express.bodyParser())
  app.use(express.methodOverride())
  app.use(express.cookieParser())
  app.use(express.session({ secret: settings.sessionSecret, store: new RedisStore() }))
  app.use(express.static(__dirname + '/static'))
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }))
})

app.set('view engine', 'jade')
app.set('view options', { layout: false })

app.error(function(err, req, res) {
  res.render('error', {
     error: err
  })
})

app.get('/', function(req, res) {
  res.render('index')
})

app.get('/auth/twitter', function(req, res, next) {
  oa.getOAuthRequestToken(function(err, token, secret, results) {
    if (err) {
      console.error(err)
      return next(err)
    }
    else {
      req.session.oauth = {}
      req.session.oauth.token = token
      console.info('oauth.token: ' + req.session.oauth.token)
      req.session.oauth.secret = secret
      console.info('oauth.secret: ' + req.session.oauth.secret)
      res.redirect('https://twitter.com/oauth/authenticate?oauth_token=' + token)
    }
  })
})

app.get('/auth/twitter/callback', function(req, res, next) {
  if (!req.session.oauth) {
    return next(new Error("You're not supposed to be here."))
  }

  req.session.oauth.verifier = req.query.oauth_verifier
  var oauth = req.session.oauth

  oa.getOAuthAccessToken(
    oauth.token
  , oauth.secret
  , oauth.verifier
  , function(err, accessToken, accessSecret, results) {
      if (err) {
        console.error(err)
        return next(err)
      }
      else {
        req.session.oauth.accessToken = accessToken
        req.session.oauth,accessSecret = accessSecret
        console.info(results)
        // TODO Store user details, token and secret in redis
        res.render('user')
      }
    }
  )
})

app.listen(3000, '0.0.0.0')
console.log('Substitute server listening on http://127.0.0.1:3000')
