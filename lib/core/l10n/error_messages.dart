import '../../l10n/gen/app_localizations.dart';
import '../network/api_failure.dart';

/// Single place that turns failures into localized, user-facing text.
/// Specific API codes win over the generic category.
String localizedFailure(AppLocalizations l10n, Object error) {
  if (error is! ApiFailure) return l10n.errorUnknown;
  switch (error.code) {
    case 'INVALID_CREDENTIALS':
      return l10n.errorInvalidCredentials;
    case 'ACCOUNT_LOCKED':
      return l10n.errorAccountLocked;
    case 'ACCOUNT_DISABLED':
      return l10n.errorAccountDisabled;
    case 'SESSION_INVALID':
    case 'UNAUTHENTICATED':
      return l10n.errorSessionExpired;
    case 'RATE_LIMITED':
      return l10n.errorRateLimited;
    case 'SERVICE_BUSY':
    case 'DEPENDENCY_UNAVAILABLE':
      return l10n.errorServiceBusy;
  }
  return switch (error.kind) {
    FailureKind.network => l10n.errorNetwork,
    FailureKind.timeout => l10n.errorTimeout,
    FailureKind.unauthorized => l10n.errorSessionExpired,
    FailureKind.forbidden => l10n.errorForbidden,
    FailureKind.notFound => l10n.errorNotFound,
    FailureKind.rateLimited => l10n.errorRateLimited,
    FailureKind.serviceBusy => l10n.errorServiceBusy,
    FailureKind.validation ||
    FailureKind.server ||
    FailureKind.invalidResponse ||
    FailureKind.unknown => l10n.errorUnknown,
  };
}
