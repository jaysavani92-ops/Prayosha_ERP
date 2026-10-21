import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import 'app_language.dart';

/// Locale-aware formatting for dates, numbers and currency.
///
/// English uses `en_IN` so numbers group as lakhs/crores (12,34,567) like the
/// Gujarati and Hindi formats; amounts are Indian rupees.
class AppFormatters {
  AppFormatters(this.language) : _tag = _intlTag(language);

  final AppLanguage language;
  final String _tag;

  static String _intlTag(AppLanguage language) => switch (language) {
    AppLanguage.english => 'en_IN',
    AppLanguage.gujarati => 'gu',
    AppLanguage.hindi => 'hi',
  };

  /// e.g. "21 Oct 2026" / "21 ઑક્ટો, 2026" / "21 अक्टू॰ 2026".
  String date(DateTime value) => DateFormat.yMMMd(_tag).format(value.toLocal());

  /// Date with the locale's time format.
  String dateTime(DateTime value) => DateFormat.yMMMd(_tag).add_jm().format(value.toLocal());

  String number(num value, {int maxDecimals = 2}) {
    final format = NumberFormat.decimalPattern(_tag)..maximumFractionDigits = maxDecimals;
    return format.format(value);
  }

  /// Indian rupees with locale grouping, e.g. "₹12,34,567.50".
  String currency(num amount) => NumberFormat.currency(locale: _tag, symbol: '₹', decimalDigits: 2).format(amount);
}

final appFormattersProvider = Provider<AppFormatters>((ref) => AppFormatters(ref.watch(languageControllerProvider)));
