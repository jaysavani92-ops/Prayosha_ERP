import 'package:flutter_web_plugins/url_strategy.dart';

import 'app/bootstrap.dart';

Future<void> main() async {
  // Clean URLs on web (/dashboard instead of /#/dashboard). The web server
  // must rewrite unknown paths to index.html — see README "Web hosting".
  usePathUrlStrategy();
  await bootstrap();
}
