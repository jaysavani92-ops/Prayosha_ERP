import '../../l10n/gen/app_localizations.dart';
import '../validation/validators.dart';

extension ValidationErrorText on ValidationError {
  String message(AppLocalizations l10n) => switch (this) {
    ValidationError.required => l10n.validationRequired,
    ValidationError.usernameFormat => l10n.validationUsernameFormat,
  };
}
