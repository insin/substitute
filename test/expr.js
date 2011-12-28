var assert = require('assert')
  , expr = require('../lib/expr')
  , isSubExpr = expr.isSubExpr
  , applySubExpr = expr.applySubExpr

describe('isSubExpr()', function() {
  it('should return true for valid substitution expressions', function() {
    assert.ok(isSubExpr('s/this/that/'), 'standard substitution expression')
    assert.ok(isSubExpr('s/th\\/is/that/'), 'escaped separator in find pattern')
    assert.ok(isSubExpr('s/this/th\\/at/'), 'escaped separator in replace pattern')
    assert.ok(isSubExpr('s/th\\/is/th\\/at/'), 'escaped terminator in both patterns')
    assert.ok(isSubExpr('s/this/that/irg'), 'standard expression with all valid flags')
    assert.ok(!isSubExpr('s/this//'), 'replace pattern can be blank for removal')
  })

  it('should return false for invalid patterns', function() {
    assert.ok(!isSubExpr('r/this/that/'), 'incorrect first character')
    assert.ok(!isSubExpr('sthis/that/'), 'missing first separator')
    assert.ok(!isSubExpr('s/thisthat/'), 'missing middle separator')
    assert.ok(!isSubExpr('s/this/that'), 'missing final separator')
    assert.ok(!isSubExpr(' s/this/that/'), 'leading space')
    assert.ok(!isSubExpr('s/this/that/ '), 'trailing space')
    assert.ok(!isSubExpr('s/th/is/that/'), 'too many separators')
    assert.ok(!isSubExpr('s//that/'), 'find pattern is required')
    assert.ok(!isSubExpr('s/this/that/x'), 'invalid flag')
  })
})

describe('applySubExpr()', function() {
  describe('regardless of mode', function() {
    it('should return null if the find pattern does not match the target text', function() {
      assert.strictEqual(applySubExpr('s/a/b/', 'ccc'), null)
    })
  })

  describe('by default, without any flags', function() {
    it('should only replace the first occurence', function() {
      assert.equal(applySubExpr('s/a/b/', 'aaa'), 'baa')
    })

    it('should be case-sensitive', function() {
      assert.equal(applySubExpr('s/a/b/', 'Aaa'), 'Aba')
    })

    it('should find and replace verbatim', function() {
      assert.equal(applySubExpr('s/[a]/b/', 'Aa[a]'), 'Aab',
                   'special regex characters in find used verbatim')
      assert.equal(applySubExpr('s/[a]/@$&/', 'Aa[a]'), 'Aa@$&',
                   'special regex patterns in replace used verbatim')
    })
  })

  describe('with global (g) flag', function() {
    it('should replace all occurences', function() {
      assert.equal(applySubExpr('s/a/b/g', 'aaa'), 'bbb')
    })
  })

  describe('with regex (r) flag', function() {
    it('should treat special RegExp characters as such', function() {
      assert.equal(applySubExpr('s/a+/b/r', 'aaa'), 'b')
    })
    it('should use special replacement patterns', function() {
      assert.equal(applySubExpr('s/[\\w ]/@$&/rg', 'like this'),
                   '@l@i@k@e@ @t@h@i@s')
    })
  })

  describe('with ignore case (i) flag', function() {
    it('should ignore case', function() {
      assert.equal(applySubExpr('s/a/b/i', 'Aaa'), 'baa')
    })
  })

  describe('with all valid flags', function() {
    it('exhibit all flag behaviours', function() {
      assert.equal(applySubExpr('s/[a]+/@$&/igr', 'AabaA'), '@Aab@aA')
    })
  })
})
