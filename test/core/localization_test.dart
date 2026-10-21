import 'dart:convert';
import 'dart:io';

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:prayosha_erp/core/assets/app_assets.dart';
import 'package:prayosha_erp/core/l10n/app_formatters.dart';
import 'package:prayosha_erp/core/l10n/app_language.dart';

Map<String, dynamic> _arb(String code) =>
    jsonDecode(File('lib/l10n/app_$code.arb').readAsStringSync()) as Map<String, dynamic>;

Set<String> _messageKeys(Map<String, dynamic> arb) => arb.keys.where((k) => !k.startsWith('@')).toSet();

Set<String> _placeholders(String message) => RegExp(r'\{(\w+)\}').allMatches(message).map((m) => m.group(1)!).toSet();

void main() {
  final english = _arb('en');

  group('ARB files', () {
    for (final code in ['gu', 'hi']) {
      test('$code has exactly the English keys', () {
        final translated = _arb(code);
        expect(_messageKeys(translated), _messageKeys(english));
        expect(translated['@@locale'], code);
      });

      test('$code keeps every placeholder and has no empty or untranslated messages', () {
        final translated = _arb(code);
        // Identical-to-English is allowed only for format-only strings.
        const formatOnly = {'uploadDetails', 'fileSizeKb', 'fileSizeMb'};
        for (final key in _messageKeys(english)) {
          final source = english[key] as String;
          final target = translated[key] as String;
          expect(target.trim(), isNotEmpty, reason: '$code.$key is empty');
          expect(_placeholders(target), _placeholders(source), reason: '$code.$key placeholders differ');
          if (!formatOnly.contains(key)) {
            expect(target, isNot(source), reason: '$code.$key looks untranslated');
          }
        }
      });
    }
  });

  group('AppLanguage', () {
    test('picks the first supported device language, else English', () {
      expect(AppLanguage.fromDevice(const [Locale('fr'), Locale('gu', 'IN')]), AppLanguage.gujarati);
      expect(AppLanguage.fromDevice(const [Locale('hi', 'IN')]), AppLanguage.hindi);
      expect(AppLanguage.fromDevice(const [Locale('fr')]), AppLanguage.english);
    });
  });

  group('AppFormatters', () {
    setUpAll(() async {
      for (final code in ['en_IN', 'gu', 'hi']) {
        await initializeDateFormatting(code);
      }
    });

    final date = DateTime(2026, 10, 21, 14, 5);

    test('uses Indian digit grouping in every language', () {
      for (final language in AppLanguage.values) {
        expect(AppFormatters(language).number(1234567.5), '12,34,567.5', reason: language.code);
      }
    });

    test('formats rupees', () {
      expect(AppFormatters(AppLanguage.english).currency(1234567.5), '₹12,34,567.50');
      expect(AppFormatters(AppLanguage.hindi).currency(99), contains('₹'));
      expect(AppFormatters(AppLanguage.gujarati).currency(99), contains('₹'));
    });

    test('formats dates in the language of the UI', () {
      expect(AppFormatters(AppLanguage.english).date(date), '21 Oct 2026');
      final gujarati = AppFormatters(AppLanguage.gujarati).date(date);
      final hindi = AppFormatters(AppLanguage.hindi).date(date);
      expect(gujarati.runes.any((c) => c >= 0x0A80 && c <= 0x0AFF), isTrue, reason: gujarati);
      expect(hindi.runes.any((c) => c >= 0x0900 && c <= 0x097F), isTrue, reason: hindi);
      expect(AppFormatters(AppLanguage.english).dateTime(date), contains('2:05'));
    });
  });

  group('AppAssets', () {
    test('every registered font file exists and is declared in pubspec.yaml', () {
      final pubspec = File('pubspec.yaml').readAsStringSync();
      for (final file in AppFonts.files.values.expand((files) => files)) {
        expect(File(file).existsSync(), isTrue, reason: '$file missing');
        expect(pubspec, contains('asset: $file'), reason: '$file not in pubspec.yaml');
      }
      for (final family in AppFonts.all) {
        expect(pubspec, contains('family: $family'));
      }
    });
  });
}
