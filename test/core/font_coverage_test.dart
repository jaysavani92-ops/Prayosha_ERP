import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:prayosha_erp/core/assets/app_assets.dart';
import 'package:prayosha_erp/core/l10n/app_language.dart';
import 'package:prayosha_erp/core/theme/app_typography.dart';

/// Reads the set of Unicode code points a TrueType font maps to glyphs
/// (cmap formats 4 and 12), so coverage is verified from the bundled files
/// themselves rather than assumed.
Set<int> _codePoints(String path) {
  final bytes = File(path).readAsBytesSync();
  final data = ByteData.sublistView(bytes);
  final numTables = data.getUint16(4);
  int? cmapOffset;
  for (var i = 0; i < numTables; i++) {
    final record = 12 + i * 16;
    final tag = ascii.decode(bytes.sublist(record, record + 4));
    if (tag == 'cmap') cmapOffset = data.getUint32(record + 8);
  }
  if (cmapOffset == null) throw StateError('$path has no cmap table');

  final points = <int>{};
  final subtables = data.getUint16(cmapOffset + 2);
  for (var i = 0; i < subtables; i++) {
    final record = cmapOffset + 4 + i * 8;
    final platform = data.getUint16(record);
    final offset = cmapOffset + data.getUint32(record + 4);
    final format = data.getUint16(offset);
    final unicode = platform == 0 || platform == 3;
    if (!unicode) continue;
    if (format == 4) {
      final segCount = data.getUint16(offset + 6) ~/ 2;
      final ends = offset + 14;
      final starts = ends + segCount * 2 + 2;
      final deltas = starts + segCount * 2;
      final rangeOffsets = deltas + segCount * 2;
      for (var s = 0; s < segCount; s++) {
        final end = data.getUint16(ends + s * 2);
        final start = data.getUint16(starts + s * 2);
        final delta = data.getInt16(deltas + s * 2);
        final rangeOffset = data.getUint16(rangeOffsets + s * 2);
        for (var c = start; c <= end && c != 0xFFFF; c++) {
          int glyph;
          if (rangeOffset == 0) {
            glyph = (c + delta) & 0xFFFF;
          } else {
            final glyphAddress = rangeOffsets + s * 2 + rangeOffset + (c - start) * 2;
            glyph = data.getUint16(glyphAddress);
            if (glyph != 0) glyph = (glyph + delta) & 0xFFFF;
          }
          if (glyph != 0) points.add(c);
        }
      }
    } else if (format == 12) {
      final groups = data.getUint32(offset + 12);
      for (var g = 0; g < groups; g++) {
        final group = offset + 16 + g * 12;
        final start = data.getUint32(group);
        final end = data.getUint32(group + 4);
        for (var c = start; c <= end; c++) {
          points.add(c);
        }
      }
    }
  }
  return points;
}

Map<String, String> _arbStrings(String code) {
  final json = jsonDecode(File('lib/l10n/app_$code.arb').readAsStringSync()) as Map<String, dynamic>;
  return {
    for (final entry in json.entries)
      if (!entry.key.startsWith('@') && entry.value is String) entry.key: entry.value as String,
  };
}

bool _isScriptNeutral(int c) => c <= 0x20 || c == 0x200C || c == 0x200D; // controls, space, ZWNJ/ZWJ

void main() {
  final coverage = {
    for (final family in AppFonts.all)
      family: {
        // Every weight must cover the same characters.
        for (final file in AppFonts.files[family]!) file: _codePoints(file),
      },
  };

  test('all weights of a family cover the same code points', () {
    for (final entry in coverage.entries) {
      final sets = entry.value.values.toList();
      for (final set in sets.skip(1)) {
        expect(set.difference(sets.first), isEmpty, reason: '${entry.key} weights differ');
        expect(sets.first.difference(set), isEmpty, reason: '${entry.key} weights differ');
      }
    }
  });

  for (final language in AppLanguage.values) {
    test('every ${language.code} string renders with the bundled fonts', () {
      final locale = Locale(language.code);
      final families = [AppTypography.primaryFamily(locale), ...AppTypography.fallbackFamilies(locale)];
      final missing = <String>{};
      // ₹ appears in currency formatting; autonyms appear in the language selector.
      final texts = [
        ..._arbStrings(language.code).values,
        '₹0123456789',
        for (final l in AppLanguage.values) l.nativeName,
      ];
      for (final text in texts) {
        for (final rune in text.runes) {
          if (_isScriptNeutral(rune)) continue;
          final covered = families.any((family) => coverage[family]!.values.first.contains(rune));
          if (!covered) {
            missing.add('U+${rune.toRadixString(16).toUpperCase().padLeft(4, '0')} "${String.fromCharCode(rune)}"');
          }
        }
      }
      expect(missing, isEmpty, reason: 'Characters with no glyph in any bundled font');
    });
  }

  test('each script is covered by its own primary family (correct shaping)', () {
    final gujarati = coverage[AppFonts.gujarati]!.values.first;
    final devanagari = coverage[AppFonts.devanagari]!.values.first;
    for (final rune in _arbStrings('gu').values.join().runes.where((c) => c >= 0x0A80 && c <= 0x0AFF)) {
      expect(
        gujarati,
        contains(rune),
        reason: 'Gujarati U+${rune.toRadixString(16)} missing from ${AppFonts.gujarati}',
      );
    }
    for (final rune in _arbStrings('hi').values.join().runes.where((c) => c >= 0x0900 && c <= 0x097F)) {
      expect(
        devanagari,
        contains(rune),
        reason: 'Devanagari U+${rune.toRadixString(16)} missing from ${AppFonts.devanagari}',
      );
    }
    // Sanity: the check is meaningful (the strings really contain those scripts).
    expect(_arbStrings('gu').values.join().runes.any((c) => c >= 0x0A80 && c <= 0x0AFF), isTrue);
    expect(_arbStrings('hi').values.join().runes.any((c) => c >= 0x0900 && c <= 0x097F), isTrue);
  });
}
