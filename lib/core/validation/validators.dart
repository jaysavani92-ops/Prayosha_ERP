/// Validation results are codes, not strings: ViewModels stay free of
/// BuildContext, and views translate codes with `ValidationErrorText`.
enum ValidationError { required, usernameFormat }

abstract final class Validators {
  /// Mirrors the API's username rule (lower-cased, 3–32 of `a-z 0-9 . _ -`).
  static final _username = RegExp(r'^[a-z0-9._-]{3,32}$');

  static ValidationError? required(String? value) =>
      (value == null || value.trim().isEmpty) ? ValidationError.required : null;

  static ValidationError? username(String? value) {
    final missing = required(value);
    if (missing != null) return missing;
    return _username.hasMatch(normalizeUsername(value!)) ? null : ValidationError.usernameFormat;
  }

  /// The API stores usernames lower-cased and trimmed.
  static String normalizeUsername(String value) => value.trim().toLowerCase();
}
