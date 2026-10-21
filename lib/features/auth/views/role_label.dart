import '../../../l10n/gen/app_localizations.dart';
import '../models/user.dart';

extension UserRoleLabel on UserRole {
  String label(AppLocalizations l10n) => switch (this) {
    UserRole.owner => l10n.roleOwner,
    UserRole.generalManager => l10n.roleGeneralManager,
    UserRole.constructionHead => l10n.roleConstructionHead,
    UserRole.projectManager => l10n.roleProjectManager,
    UserRole.siteEngineer => l10n.roleSiteEngineer,
    UserRole.supervisor => l10n.roleSupervisor,
    UserRole.storeKeeper => l10n.roleStoreKeeper,
    UserRole.accountant => l10n.roleAccountant,
    // A role added on the server before the app knows it.
    UserRole.unknown => '—',
  };
}
