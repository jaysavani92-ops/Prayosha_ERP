import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
import 'package:prayosha_erp/features/auth/models/auth_tokens.dart';
import 'package:prayosha_erp/features/auth/models/user.dart';
import 'package:prayosha_erp/features/projects/viewmodels/project_directory_view_model.dart';
import 'package:prayosha_erp/features/projects/views/directory_header.dart';
import 'package:prayosha_erp/features/projects/views/project_card.dart';
import 'package:prayosha_erp/features/projects/views/project_directory_view.dart';
import 'package:prayosha_erp/l10n/gen/app_localizations.dart';

import '../../helpers/app_fonts.dart';
import '../../helpers/fakes.dart';
import '../../helpers/pump_app.dart';

final en = lookupAppLocalizations(const Locale('en'));

User _user(UserRole role) => User(
  id: 'u-${role.apiValue}',
  username: 'tester',
  displayName: 'Priya Shah',
  role: role,
  isActive: true,
  lastLoginAt: null,
  createdAt: DateTime.utc(2026),
);

/// Signs in as [role] and lands on the Project Directory (the home page).
Future<ProviderContainer> openDirectory(
  WidgetTester tester, {
  UserRole role = UserRole.projectManager,
  Size size = const Size(1366, 900),
}) async {
  setWindowSize(tester, size);
  final auth = MockAuthService();
  final uploads = MockUploadsRepository();
  when(() => uploads.recentUploads()).thenAnswer((_) async => []);
  when(() => auth.login(username: 'tester', password: 'pw')).thenAnswer(
    (_) async => LoginResult(
      tokens: AuthTokens(accessToken: 'a', expiresAt: DateTime(2030), refreshToken: 'r'),
      user: _user(role),
    ),
  );
  final container = await pumpFullApp(tester, authService: auth, uploadsRepository: uploads);
  await tester.enterText(find.byKey(const ValueKey('login-username')), 'tester');
  await tester.enterText(find.byKey(const ValueKey('login-password')), 'pw');
  await tester.ensureVisible(find.byKey(const ValueKey('login-submit')));
  await tester.tap(find.byKey(const ValueKey('login-submit')));
  await tester.pumpAndSettle();
  expect(find.byType(ProjectDirectoryView), findsOneWidget);
  return container;
}

Future<void> tapKey(WidgetTester tester, String key) async {
  final finder = find.byKey(ValueKey(key)).first;
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Finder card(String id) => find.byKey(ValueKey('project-card-$id'));

int cardCount(WidgetTester tester) => find.byType(ProjectCard).evaluate().length;

/// Opens the dropdown [dropdown] and picks [option] (its menu entry, which
/// is drawn last, above the field's own copy of the selected item).
Future<void> choose(WidgetTester tester, String dropdown, Object option) async {
  await tapKey(tester, dropdown);
  await tester.tap(find.byKey(ValueKey('option-$option')).last);
  await tester.pumpAndSettle();
}

void main() {
  // Real glyph metrics, so layout measurements match the app.
  setUpAll(loadAppFonts);

  testWidgets('home: header, KPI cards, workspace, controls and every project', (tester) async {
    await openDirectory(tester);
    expect(find.text(en.projectsTitle), findsOneWidget);
    expect(find.text(en.projectsActiveSites(5)), findsOneWidget);
    expect(find.text(en.projectsSubtitle), findsOneWidget);
    expect(find.byKey(const ValueKey('site-weather')), findsNothing);
    expect(find.text(en.kpiPortfolioValue.toUpperCase()), findsOneWidget);
    expect(find.text(en.kpiSitesValue(4)), findsOneWidget);
    expect(find.text(en.kpiSitesBreakdown(3, 1)), findsOneWidget);
    expect(find.text(en.kpiAlertsValue(11)), findsOneWidget);
    expect(find.text('[PRSG-006] Shivalay Heights'), findsOneWidget);
    expect(find.byKey(const ValueKey('directory-toolbar')), findsOneWidget);
    expect(cardCount(tester), 6);
    expect(find.text(en.delayedCount(5)), findsOneWidget);
    expect(find.byKey(const ValueKey('projects-create')), findsOneWidget);
  });

  testWidgets('KPI cards in a row share one height', (tester) async {
    await openDirectory(tester, size: const Size(375, 812));
    final cards = find.descendant(
      of: find.byKey(const ValueKey('kpi-strip')),
      matching: find.byType(DirectoryAccentCard),
    );
    expect(cards, findsNWidgets(4));
    // 2 × 2 on a phone: each row's two cards are the same height.
    final heights = [for (var i = 0; i < 4; i++) tester.getSize(cards.at(i)).height];
    expect(heights[0], heights[1]);
    expect(heights[2], heights[3]);
  });

  testWidgets('site engineers see no budgets and cannot create or archive', (tester) async {
    await openDirectory(tester, role: UserRole.siteEngineer);
    expect(find.byKey(const ValueKey('projects-create')), findsNothing);
    // The KPI shows "Restricted"; its tooltip says who can see it.
    expect(
      find.descendant(of: find.byKey(const ValueKey('kpi-strip')), matching: find.text(en.projectRestricted)),
      findsOneWidget,
    );
    expect(find.text(en.financialsRestricted), findsOneWidget);
    expect(find.textContaining('₹'), findsNothing);
    await tapKey(tester, 'project-actions-prj-014');
    expect(find.byKey(const ValueKey('project-action-share')), findsOneWidget);
    expect(find.byKey(const ValueKey('project-action-archive')), findsNothing);
  });

  testWidgets('search and the filter narrow the list; the empty state clears them', (tester) async {
    await openDirectory(tester);
    await tester.enterText(find.byKey(const ValueKey('projects-search')), 'surat');
    await tester.pumpAndSettle();
    expect(card('prj-007'), findsOneWidget);
    expect(cardCount(tester), 1);

    await choose(tester, 'projects-filter', ProjectFilter.planning);
    expect(find.byKey(const ValueKey('projects-empty')), findsOneWidget);
    await tapKey(tester, 'projects-clear-filters');
    expect(cardCount(tester), 6);
    expect(tester.widget<TextField>(find.byKey(const ValueKey('projects-search'))).controller!.text, isEmpty);

    await choose(tester, 'projects-filter', ProjectFilter.planning);
    expect(card('prj-003'), findsOneWidget);
    expect(cardCount(tester), 1);
  });

  testWidgets('projects are listed most recently created first', (tester) async {
    await openDirectory(tester);
    // Sabarmati Riverside Towers (prj-003) was added most recently and Prayosha
    // Greens Phase I (prj-009) first.
    expect(tester.getTopLeft(card('prj-003')).dy, lessThanOrEqualTo(tester.getTopLeft(card('prj-007')).dy));
    expect(tester.getTopLeft(card('prj-003')).dy, lessThan(tester.getTopLeft(card('prj-009')).dy));
  });

  testWidgets('the filter menu shows how many projects each option holds and ticks the current one', (tester) async {
    await openDirectory(tester);
    await tapKey(tester, 'projects-filter');
    Finder count(ProjectFilter f, String n) =>
        find.descendant(of: find.byKey(ValueKey('option-$f')).last, matching: find.text(n));
    expect(count(ProjectFilter.active, '6'), findsOneWidget);
    expect(count(ProjectFilter.inProgress, '3'), findsOneWidget);
    expect(count(ProjectFilter.archived, '0'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('option-ProjectFilter.active')).last,
        matching: find.byIcon(Icons.check),
      ),
      findsOneWidget,
    );
  });

  testWidgets('the toolbar has only search and the filter', (tester) async {
    await openDirectory(tester);
    final toolbar = find.byKey(const ValueKey('directory-toolbar'));
    expect(find.descendant(of: toolbar, matching: find.byKey(const ValueKey('projects-search'))), findsOneWidget);
    expect(find.descendant(of: toolbar, matching: find.byKey(const ValueKey('projects-filter'))), findsOneWidget);
    expect(find.descendant(of: toolbar, matching: find.byType(ButtonStyleButton)), findsNothing);
    expect(find.descendant(of: toolbar, matching: find.byType(SegmentedButton<Object>)), findsNothing);
  });

  testWidgets('zone inspector expands towers, floors, units and rooms', (tester) async {
    await openDirectory(tester);
    await tapKey(tester, 'project-card-prj-014');
    expect(find.byKey(const ValueKey('zone-inspector')), findsOneWidget);
    expect(find.text(en.inspectorSummary(3, (2 + 13 * 4) + (1 + 13 * 4) + (1 + 11 * 4))), findsOneWidget);
    await tapKey(tester, 'zone-tower-Tower A');
    await tester.tap(find.text(en.floorLevel(1)));
    await tester.pumpAndSettle();
    await tester.tap(find.text('A-102, 3 BHK'));
    await tester.pumpAndSettle();
    expect(find.text('Bedroom 3'), findsOneWidget);
  });

  testWidgets('WhatsApp preview copies the message and says nothing was sent', (tester) async {
    String? copied;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copied = (call.arguments as Map)['text'] as String;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    await openDirectory(tester);
    await tapKey(tester, 'project-actions-prj-014');
    await tapKey(tester, 'project-action-share');
    expect(find.byKey(const ValueKey('whatsapp-message')), findsOneWidget);
    await tapKey(tester, 'whatsapp-copy');
    expect(copied, startsWith('*Shivalay Heights* (PRSG-006)'));
    expect(find.byKey(const ValueKey('whatsapp-preview')), findsNothing);
    expect(find.text(en.whatsappCopied), findsOneWidget);
  });

  testWidgets('archiving asks first, moves the project to the archive, and restore brings it back', (tester) async {
    await openDirectory(tester);
    await tapKey(tester, 'project-actions-prj-011');
    await tapKey(tester, 'project-action-archive');
    expect(find.text(en.archiveTitle('Shreeji Arcade')), findsOneWidget);
    await tester.tap(find.text(en.commonCancel));
    await tester.pumpAndSettle();
    expect(card('prj-011'), findsOneWidget);

    await tapKey(tester, 'project-actions-prj-011');
    await tapKey(tester, 'project-action-archive');
    await tester.tap(find.widgetWithText(FilledButton, en.archiveConfirm));
    await tester.pumpAndSettle();
    expect(card('prj-011'), findsNothing);
    expect(find.text(en.archived('Shreeji Arcade')), findsOneWidget);

    await choose(tester, 'projects-filter', ProjectFilter.archived);
    expect(card('prj-011'), findsOneWidget);
    expect(find.text(en.archivedBadge), findsOneWidget);
    await tapKey(tester, 'project-actions-prj-011');
    await tapKey(tester, 'project-action-restore');
    expect(find.text(en.restored('Shreeji Arcade')), findsOneWidget);
    await choose(tester, 'projects-filter', ProjectFilter.active);
    expect(card('prj-011'), findsOneWidget);
  });

  testWidgets('create validates, then adds the project in planning', (tester) async {
    await openDirectory(tester);
    await tapKey(tester, 'projects-create');
    await tapKey(tester, 'create-submit');
    expect(find.text(en.validationRequired), findsNWidgets(2));
    await tester.enterText(find.byKey(const ValueKey('create-name')), 'Ambaji Villas');
    await tester.enterText(find.byKey(const ValueKey('create-city')), 'Palanpur');
    await tapKey(tester, 'create-submit');
    expect(find.byKey(const ValueKey('create-project')), findsNothing);
    expect(find.text('Ambaji Villas'), findsWidgets);
    expect(find.text(en.created('Ambaji Villas')), findsOneWidget);
    expect(cardCount(tester), 7);
    expect(find.text('PRSG-008'), findsOneWidget);
  });

  testWidgets('workspace: choose the project; shortcuts open their suites', (tester) async {
    await openDirectory(tester);
    expect(find.text('[PRSG-006] Shivalay Heights'), findsOneWidget);
    await tapKey(tester, 'project-actions-prj-021');
    await tapKey(tester, 'project-action-setActive');
    expect(find.text('[PRSG-005] Narmada Residency'), findsOneWidget);
    // The pill in the workspace card switches too.
    await tapKey(tester, 'workspace-project');
    await tapKey(tester, 'workspace-choice-prj-007');
    expect(find.text('[PRSG-003] Prayosha Business Hub'), findsOneWidget);

    await tapKey(tester, 'workspace-inventory');
    expect(find.text(en.workspaceInventoryUnavailable), findsOneWidget);
    await tapKey(tester, 'workspace-tasks');
    expect(GoRouter.of(tester.element(find.byType(AppBar).first)).state.uri.path, '/tasks');
  });

  testWidgets('pulling down refreshes the projects', (tester) async {
    await openDirectory(tester);
    await tapKey(tester, 'project-actions-prj-011');
    await tapKey(tester, 'project-action-archive');
    await tester.tap(find.widgetWithText(FilledButton, en.archiveConfirm));
    await tester.pumpAndSettle();
    expect(card('prj-011'), findsNothing);
    final page = find.byKey(const ValueKey('project-directory'));
    await tester.drag(page, const Offset(0, 5000)); // back to the top
    await tester.pumpAndSettle();
    await tester.fling(page, const Offset(0, 400), 1000);
    await tester.pumpAndSettle();
    expect(card('prj-011'), findsOneWidget);
  });

  testWidgets('phone layout meets tap-target and contrast guidelines', (tester) async {
    final handle = tester.ensureSemantics();
    await openDirectory(tester, size: const Size(393, 852));
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    await expectLater(tester, meetsGuideline(textContrastGuideline));
    handle.dispose();
  });
}
