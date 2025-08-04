const oneOf = (methods) => (attributeName) => (paramObject) => {
  //console.log('oneOf', { methods });
  const v = methods.reduce((previous, method) => (Array.isArray(previous) ? previous : method(previous)), paramObject[attributeName]);
  return Array.isArray(v) ? { bad: v[0].replace('%s', attributeName) } : { good: v }; // Bad is array
};
const prettyArray = (list) => "'" + list.join("', '") + "'";

// Simple functions to validate at the lowest level (takes a value, returns value or [error])

const giveDefault = (theDefault) => (v) => v === '~pINg~' ? `default($(theDefault))` : v == null ? theDefault : v;
const exists = () => (v) => v === '~pINg~' ? `exists()` : v == null ? ['%s must exist'] : v;

const asNumber = () => (v) => v === '~pINg~' ? `asNumber()` : typeof v === 'number' ? v : Number(v);
const integer = () => (v) => v === '~pINg~' ? `integer()` : typeof v === 'number' && v === Math.trunc(v) ? v : ['%s is not an integer'];
const positive = () => (v) => v === '~pINg~' ? `positive()` : typeof v === 'number' && v > 0 ? v : ['%s is not positive'];
const number_ge = (c) => (v) => v === '~pINg~' ? `>=(${c})` : typeof v === 'number' && v >= c ? v : [`%s is not a number >=${c}`];

const asString = () => (v) => v === '~pINg~' ? `asString()` : typeof v === 'string' ? v : String(v);
const minLength = (len) => (v) =>
  v === '~pINg~' ? `minLength(${len})` : typeof v !== 'string' ? v : v.length >= len ? v : [`%s not minlength ${len}`];
const lower = () => (v) => v === '~pINg~' ? `lower()` : typeof v !== 'string' ? v : v.toLocaleLowerCase();
const clean = (pattern) => (v) => v === '~pINg~' ? `clean(${pattern})` : typeof v !== 'string' ? v : v.replace(pattern, '');
const inList = (list) => (v) =>
  v === '~pINg~' ? `inList(${prettyArray(list)})` : list.includes(v) ? v : [`%s not in list (${prettyArray(list)})`];

// Not tested
const regex =
  (pattern, substituteText = null) =>
  (v) =>
    v === '~pINg~'
      ? `regex(${substituteText ?? pattern})`
      : String(v).match(pattern)
      ? String(v)
      : [`%s fails to match (${substituteText ?? pattern})`];

// Attempt to describe a command validation, using the new methods...
// Example: params: { email: '{Email}', option: ['', 'noRole', 'anyRole'] }

const _email_pattern =
  /^[a-z0-9!#$%&'*+\/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+\/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const validEmail = [asString(), clean(/\s/g), minLength(5), lower(), regex(_email_pattern, 'email')];
const validEmailRequired = [exists(), ...validEmail];
const validEmailOptional = [giveDefault(false), ...validEmail]; // Messin' around

if (false) {
  // Locally use e.g.:
  const optionRequired = [exists(), inList(['', 'noRole', 'anyRole'])];
  const spec = {
    email2: validEmailRequired,
    email3: validEmailRequired,
    option: optionRequired,
  };

  const testObject = { email: 'stuff', email2: 'two', email3: 'a@b.c', option: 'thing' };
  // const testObject= { Xemail: '', Xoption: 'whatever'};
  // console.log('main:spec', Object.entries(spec))
  /** */
  console.log(
    'validate:ping',
    '\n  ' +
      Object.entries(spec)
        .map(([nm, val]) => [nm + ': ' + val.map((f) => f('~pINg~')).join('; ')])
        .join('\n  ')
  );
  console.log(
    'validate:oneOf',
    Object.entries(spec).map(([nm, val]) => oneOf(val)(nm)(testObject))
  );
  process.exit(1);
  /* */
}
exports.oneOf = oneOf;
exports.giveDefault = giveDefault;
exports.exists = exists;
exports.asNumber = asNumber;
exports.integer = integer;
exports.positive = positive;
exports.number_ge = number_ge;
exports.asString = asString;
exports.minLength = minLength;
exports.clean = clean;
exports.inList = inList;
exports.regex = regex;
exports.validEmail = validEmail;
exports.validEmailRequired = validEmailRequired;
exports.validEmailOptional = validEmailOptional;
