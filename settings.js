module.exports = {
  consumerKey: process.env.npm_package_config__twitter_consumer_key
, consumerSecret: process.env.npm_package_config__twitter_consumer_secret
, sessionSecret: process.env.npm_package_config__session_secret
, domain: process.env.npm_package_config_domain
, port: parseInt(process.env.npm_package_config_port, 10)
}
