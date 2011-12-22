==========
Substitute
==========

.. image:: https://github.com/insin/substitute/raw/master/icon.png

A `Node.js`_/`ntwitter`_-based `Twitter`_ app which monitors for tweets which consist of a "s/this/that"
substitution expression and performs the replacement on the preceding tweet if
if it matches the "this" part.

Sample code::

    var Substitute = require('./substitute')
    var s = new Substitute('user screen name', {
      consumer_key: 'app key'
    , consumer_secret: 'app secret'
    , access_token_key: 'user key'
    , access_token_secret: 'user secret'
    })
    s.start()

.. _`Node.js`: http://nodejs.org
.. _`ntwitter`: https://github.com/AvianFlu/ntwitter
.. _`Twitter`: http://twitter.com