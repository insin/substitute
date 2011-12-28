/** Matches s/find/replace/flags? substitution expressions. */
var SUB_EXPR_RE = /^s\/((?:\\\/|[^\/])+)\/((?:\\\/|[^\/])+)\/([igr]*)$/
/** Matches special RegExp characters for escaping find expressions. */
var ESCAPE_FIND_RE = /[-[\]{}()*+?.,\\^$|#\s]/g
/** Matches special RegExp replacement patterns for escaping replace strings. */
var ESCAPE_REPLACE_RE = /\$[&`']|\$\d\d?/g

/**
 * Determines if the given text looks like a substitution expression.
 */
exports.isSubExpr = function(text) {
  return SUB_EXPR_RE.test(text)
}

/**
 * Applies a substitution expression to the given text, returning the corrected
 * text, or null if the find expression in the pattern didn't find a match in
 * the text.
 *
 * @param expr a substitution expression.
 * @param text tweet text to be corrected with the substitution expression.
 */
exports.applySubExpr = function(expr, text) {
  // Assuming that we've already checked the pattern text is really a pattern
  var match = SUB_EXPR_RE.exec(expr)

  var find = match[1]
    , replace = match[2]
    , flags = match[3] || ''

  if (flags && flags.indexOf('r') != -1) {
    // Leave the find and replace strings untouched and remove the regexp flag
    flags = flags.replace(/r/g, '')
  }
  else {
    // No regexp flag, so escape special regexp characters and phrases in find
    // and replace strings.
    find = find.replace(ESCAPE_FIND_RE, '\\$&')
    replace = replace.replace(ESCAPE_REPLACE_RE, '$$$&')
  }

  // Compile the find regexp
  find = new RegExp(find, flags)

  // If the text to be corrected doesn't look like the find expression, we can't
  // do anything with it.
  if (!find.test(text)) {
    return null
  }

  // Perform the substitution
  return text.replace(find, replace)
}
