// An expected failure that is shown to the user, translated via its i18n key
class UserError extends Error {
  constructor(key, vars = {}) {
    super(key);
    this.name = "UserError";
    this.key = key;
    this.vars = vars;
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.statusCode = status;
  }
}

module.exports = { UserError, HttpError };
