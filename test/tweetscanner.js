var sinon = require('sinon')
  , TweetScanner = require('../lib/tweetscanner')

describe('TweetScanner', function() {
  var scanner
    , testUser = 'testUser'
    , testAuth = {
        consumer_key: 'ck'
      , consumer_secret: 'cs'
      , access_token_key: 'ak'
      , access_token_secret: 'as'
      }

  describe('correctTweet()', function() {
    // Test data
    var text = 'new text'
      , originalTweet = {id_str: '123', in_reply_to_status_id_str: '987'}
      , subTweet = {id_str: '321'}

    // Stubs
    var updateStatus, destroyStatus

    beforeEach(function() {
      scanner = new TweetScanner(testUser, testAuth)
      updateStatus = sinon.stub(scanner.twitter, 'updateStatus')
      destroyStatus = sinon.stub(scanner.twitter, 'destroyStatus')
    })

    it('should call updateStatus with corrected tweet text and call ' +
       'destroyStatus with incorrect and substitution tweet ids on success',
    function(done) {
      updateStatus.callsArg(2)
      destroyStatus.callsArg(1)
      scanner.correctTweet(text, originalTweet, subTweet, function() {
        sinon.assert.calledOnce(updateStatus)
        sinon.assert.calledWith(updateStatus, text, {
          in_reply_to_status_id: originalTweet.in_reply_to_status_id_str
        })
        sinon.assert.calledTwice(destroyStatus)
        sinon.assert.calledWith(destroyStatus, originalTweet.id_str)
        sinon.assert.calledWith(destroyStatus, subTweet.id_str)
        sinon.assert.callOrder(updateStatus, destroyStatus)
        done()
      })
    })

    it('should not call destroyStatus if updateStatus fails', function(done) {
      updateStatus.callsArgWith(2, new Error("Error updating status."))
      scanner.correctTweet(text, originalTweet, subTweet, function() {
        sinon.assert.calledOnce(updateStatus)
        sinon.assert.calledWith(updateStatus, text, {
          in_reply_to_status_id: originalTweet.in_reply_to_status_id_str
        })
        sinon.assert.notCalled(destroyStatus)
        done()
      })
    })
  })
})
