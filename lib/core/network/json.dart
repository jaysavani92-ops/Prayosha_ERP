/// Small helpers for typed JSON decoding. They throw [FormatException] on
/// unexpected shapes so a contract change fails loudly instead of producing
/// half-initialised models.
typedef JsonMap = Map<String, dynamic>;

JsonMap asJsonMap(Object? value, [String context = 'response']) {
  if (value is Map<String, dynamic>) return value;
  throw FormatException('Expected an object for $context');
}

extension JsonMapRead on JsonMap {
  String string(String key) {
    final value = this[key];
    if (value is String) return value;
    throw FormatException('Expected "$key" to be a string');
  }

  String? stringOrNull(String key) {
    final value = this[key];
    if (value == null || value is String) return value as String?;
    throw FormatException('Expected "$key" to be a string or null');
  }

  int integer(String key) {
    final value = this[key];
    if (value is int) return value;
    throw FormatException('Expected "$key" to be an integer');
  }

  DateTime dateTime(String key) => DateTime.parse(string(key));

  DateTime? dateTimeOrNull(String key) {
    final value = stringOrNull(key);
    return value == null ? null : DateTime.parse(value);
  }

  JsonMap object(String key) => asJsonMap(this[key], key);

  List<JsonMap> objectList(String key) {
    final value = this[key];
    if (value is List) return [for (final item in value) asJsonMap(item, key)];
    throw FormatException('Expected "$key" to be a list');
  }
}
