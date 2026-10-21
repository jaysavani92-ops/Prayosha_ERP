import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/l10n/app_language.dart';
import '../../../core/l10n/error_messages.dart';
import '../../../core/l10n/validation_messages.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_card.dart';
import '../../../core/widgets/app_dialog.dart';
import '../../../core/widgets/app_states.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/language_selector.dart';
import '../../../core/widgets/responsive.dart';
import '../viewmodels/auth_controller.dart';
import '../viewmodels/login_view_model.dart';

class LoginView extends ConsumerStatefulWidget {
  const LoginView({super.key});

  @override
  ConsumerState<LoginView> createState() => _LoginViewState();
}

class _LoginViewState extends ConsumerState<LoginView> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  void _submit() {
    ref.read(loginViewModelProvider.notifier).submit(username: _username.text, password: _password.text);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final state = ref.watch(loginViewModelProvider);
    final viewModel = ref.read(loginViewModelProvider.notifier);
    final sessionExpired = ref.watch(authControllerProvider.notifier).sessionExpired;
    final text = Theme.of(context).textTheme;

    final form = AutofillGroup(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(header: true, child: Text(l10n.loginTitle, style: text.headlineSmall)),
          const SizedBox(height: AppSpacing.xs),
          Text(l10n.loginSubtitle, style: text.bodyMedium?.copyWith(color: context.semanticColors.mutedText)),
          const SizedBox(height: AppSpacing.xl),
          if (state.failure != null || sessionExpired) ...[
            AppInlineError(
              message: state.failure != null ? localizedFailure(l10n, state.failure!) : l10n.errorSessionExpired,
            ),
            const SizedBox(height: AppSpacing.lg),
          ],
          AppTextField(
            key: const ValueKey('login-username'),
            controller: _username,
            label: l10n.loginUsernameLabel,
            hint: l10n.loginUsernameHint,
            prefixIcon: AppIcons.user,
            errorText: state.usernameError?.message(l10n),
            enabled: !state.isSubmitting,
            autofocus: true,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.username],
            onChanged: (_) => viewModel.fieldChanged(username: true),
            onSubmitted: (_) => _passwordFocus.requestFocus(),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            key: const ValueKey('login-password'),
            controller: _password,
            focusNode: _passwordFocus,
            label: l10n.loginPasswordLabel,
            hint: l10n.loginPasswordHint,
            prefixIcon: AppIcons.lock,
            obscure: true,
            showSecretLabel: l10n.loginShowPassword,
            hideSecretLabel: l10n.loginHidePassword,
            errorText: state.passwordError?.message(l10n),
            enabled: !state.isSubmitting,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.password],
            onChanged: (_) => viewModel.fieldChanged(password: true),
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: AppSpacing.xl),
          AppButton(
            key: const ValueKey('login-submit'),
            label: l10n.loginSubmit,
            loadingLabel: l10n.loginSubmitting,
            isLoading: state.isSubmitting,
            onPressed: _submit,
            expand: true,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: l10n.loginForgotPassword,
            variant: AppButtonVariant.text,
            icon: AppIcons.help,
            onPressed: () => showAppInfoDialog(
              context,
              title: l10n.loginForgotPasswordTitle,
              message: l10n.loginForgotPasswordMessage,
              closeLabel: l10n.commonClose,
            ),
          ),
        ],
      ),
    );

    return Scaffold(
      body: SafeArea(
        child: ResponsiveBuilder(
          builder: (context, size) => Stack(
            children: [
              Center(
                child: SingleChildScrollView(
                  padding: pagePadding(size),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: AppSpacing.formMaxWidth),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const _Brand(),
                        const SizedBox(height: AppSpacing.xl),
                        // Cards only on larger windows; phones use the full width.
                        if (size == WindowSize.compact)
                          form
                        else
                          AppCard(padding: const EdgeInsets.all(AppSpacing.xl), child: form),
                      ],
                    ),
                  ),
                ),
              ),
              const PositionedDirectional(top: AppSpacing.sm, end: AppSpacing.sm, child: LanguageSelector()),
            ],
          ),
        ),
      ),
    );
  }
}

class _Brand extends StatelessWidget {
  const _Brand();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    final text = Theme.of(context).textTheme;
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(color: colors.primary, borderRadius: AppRadius.lgAll, boxShadow: AppShadows.md),
          child: ExcludeSemantics(child: Icon(AppIcons.brand, size: 36, color: colors.secondary)),
        ),
        const SizedBox(height: AppSpacing.md),
        Text(
          l10n.appTitle,
          style: text.headlineMedium?.copyWith(color: colors.primary),
          textAlign: TextAlign.center,
        ),
        Text(
          l10n.appSubtitle,
          style: text.bodyMedium?.copyWith(color: context.semanticColors.mutedText),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}
