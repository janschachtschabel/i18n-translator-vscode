/**
 * For a file read as ISO-8859-1: writes the characters it cannot hold as `\uXXXX`. The read text has none of
 * them, so they can only come from texts a format wrote into string literals or values, where JSON and
 * .properties read the escape exactly.
 */
export function escapeBeyondLatin1(text: string): string {
  return escapeUnits(text, (unit) => unit > 0xff);
}

/** Writes every UTF-16 code unit for which `escape` holds as `\uXXXX`. */
export function escapeUnits(text: string, escape: (unit: number) => boolean): string {
  let result = '';
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const unit = text.charCodeAt(index);
    if (escape(unit)) {
      result += `${text.slice(start, index)}\\u${unit.toString(16).padStart(4, '0')}`;
      start = index + 1;
    }
  }
  return result + text.slice(start);
}
