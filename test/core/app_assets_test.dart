import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:prayosha_erp/core/assets/app_assets.dart';

/// Asset paths live only in app_assets.dart. A typo there, or a file that was
/// never added to the repo or pubspec.yaml, would fail only at runtime (a
/// broken image), so it fails here instead.
void main() {
  final pubspec = File('pubspec.yaml').readAsStringSync();

  for (final path in [...AppImages.all, ...AppFonts.files.values.expand((files) => files)]) {
    test('$path exists and is declared in pubspec.yaml', () {
      expect(File(path).existsSync(), isTrue, reason: '$path is missing');
      expect(pubspec.contains('- $path') || pubspec.contains('asset: $path'), isTrue, reason: '$path not in pubspec');
    });
  }
}
