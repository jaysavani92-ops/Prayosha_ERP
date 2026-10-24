import 'dart:io';

import 'package:flutter/services.dart';
import 'package:prayosha_erp/core/assets/app_assets.dart';

/// Loads the app's bundled fonts into the test engine. Widget tests otherwise
/// draw every glyph with the square test font, whose metrics differ from the
/// real ones: Gujarati and Devanagari lines are taller than
/// `fontSize × height`, and an overflow that only happens with real text
/// would go unnoticed. Call from `setUpAll`.
Future<void> loadAppFonts() async {
  for (final MapEntry(key: family, value: files) in AppFonts.files.entries) {
    final loader = FontLoader(family);
    for (final path in files) {
      loader.addFont(Future.value(ByteData.sublistView(File(path).readAsBytesSync())));
    }
    await loader.load();
  }
}
