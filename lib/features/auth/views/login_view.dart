import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/config/app_config.dart';
import '../../../core/l10n/app_language.dart';
import '../../../core/l10n/error_messages.dart';
import '../../../core/l10n/validation_messages.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_dialog.dart';
import '../../../core/widgets/app_states.dart';
import '../../../core/widgets/app_text_field.dart';
import '../../../core/widgets/glass_surface.dart';
import '../../../core/widgets/language_selector.dart';
import '../../../core/widgets/on_photo.dart';
import '../../../core/widgets/responsive.dart';
import '../viewmodels/auth_controller.dart';
import '../viewmodels/login_view_model.dart';
import 'login_backdrop.dart';

/// Sign-in: a glass card floating over the site photograph, with the
/// language switcher above it and the footer below.
///
/// One scroll view holds everything, at least as tall as the window. Extra
/// height goes between the top bar, card and footer, so nothing overlaps;
/// when the content is taller (short windows, 200 % text, open keyboard) the
/// page scrolls instead of overflowing.
class LoginView extends ConsumerStatefulWidget {
  const LoginView({super.key});

  @override
  ConsumerState<LoginView> createState() => _LoginViewState();
}

class _LoginViewState extends ConsumerState<LoginView> {
  /// Share of a portrait phone's height kept for the photo above the card.
  static const _photoShare = 0.22;

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
    final card = _LoginCard(
      form: _LoginForm(username: _username, password: _password, passwordFocus: _passwordFocus, onSubmit: _submit),
    );

    return Scaffold(
      backgroundColor: context.semanticColors.brandNavy,
      body: Stack(
        fit: StackFit.expand,
        children: [
          const LoginBackdrop(),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, constraints) {
                final size = AppBreakpoints.of(constraints.maxWidth);
                final padding = pagePadding(size);
                // Portrait phones: the card starts a fixed share of the height
                // down, leaving the hard hat with the Prayosha mark visible
                // above it. Anchoring its top (not its bottom) means taller
                // Gujarati or Hindi text grows the card downwards instead of
                // moving it when the language changes. Elsewhere it is centred.
                final heroCard =
                    !size.isAtLeast(WindowSize.medium) &&
                    AppBreakpoints.heightOf(constraints.maxHeight) != WindowHeight.compact;
                final cardGap = responsiveValue(size, compact: AppSpacing.xl, medium: AppSpacing.xxl);

                return SingleChildScrollView(
                  padding: padding,
                  child: ConstrainedBox(
                    constraints: BoxConstraints(
                      minHeight: (constraints.maxHeight - padding.vertical).clamp(0, double.infinity),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (heroCard)
                          Column(
                            mainAxisSize: MainAxisSize.min,
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const OnPhoto(key: ValueKey('login-top-bar'), child: _TopBar()),
                              SizedBox(height: math.max(cardGap, constraints.maxHeight * _photoShare)),
                              card,
                              const SizedBox(height: AppSpacing.lg),
                            ],
                          )
                        else ...[
                          const OnPhoto(key: ValueKey('login-top-bar'), child: _TopBar()),
                          Padding(
                            padding: EdgeInsets.symmetric(vertical: cardGap),
                            child: card,
                          ),
                        ],
                        const OnPhoto(key: ValueKey('login-footer'), child: _Footer()),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

/// Only the language switcher, at the end side. Its size does not depend on
/// the language, so switching never moves the card.
class _TopBar extends StatelessWidget {
  const _TopBar();

  @override
  Widget build(BuildContext context) {
    return const Align(
      alignment: AlignmentDirectional.centerEnd,
      child: LanguageSelector(style: LanguageSelectorStyle.segmented),
    );
  }
}

/// Liquid-glass card over the photo, capped at the form width and centred.
class _LoginCard extends StatelessWidget {
  const _LoginCard({required this.form});

  final Widget form;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: AppSpacing.formMaxWidth),
        child: GlassSurface(
          key: const ValueKey('login-card'),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.xl, AppSpacing.xxl, AppSpacing.xl, AppSpacing.xl),
            child: form,
          ),
        ),
      ),
    );
  }
}

class _LoginForm extends ConsumerWidget {
  const _LoginForm({
    required this.username,
    required this.password,
    required this.passwordFocus,
    required this.onSubmit,
  });

  final TextEditingController username;
  final TextEditingController password;
  final FocusNode passwordFocus;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final state = ref.watch(loginViewModelProvider);
    final viewModel = ref.read(loginViewModelProvider.notifier);
    final sessionExpired = ref.watch(authControllerProvider.notifier).sessionExpired;

    return AutofillGroup(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _Brand(),
          const SizedBox(height: AppSpacing.xl),
          if (ref.watch(demoModeProvider)) ...[const _DemoNotice(), const SizedBox(height: AppSpacing.lg)],
          if (state.failure != null || sessionExpired) ...[
            AppInlineError(
              message: state.failure != null ? localizedFailure(l10n, state.failure!) : l10n.errorSessionExpired,
            ),
            const SizedBox(height: AppSpacing.lg),
          ],
          AppTextField(
            key: const ValueKey('login-username'),
            controller: username,
            label: l10n.loginUsernameLabel,
            prefixIcon: AppIcons.user,
            errorText: state.usernameError?.message(l10n),
            enabled: !state.isSubmitting,
            autofocus: true,
            keyboardType: TextInputType.text,
            textInputAction: TextInputAction.next,
            autofillHints: const [AutofillHints.username],
            onChanged: (_) => viewModel.fieldChanged(username: true),
            onSubmitted: (_) => passwordFocus.requestFocus(),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            key: const ValueKey('login-password'),
            controller: password,
            focusNode: passwordFocus,
            label: l10n.loginPasswordLabel,
            prefixIcon: AppIcons.lock,
            obscure: true,
            showSecretLabel: l10n.loginShowPassword,
            hideSecretLabel: l10n.loginHidePassword,
            errorText: state.passwordError?.message(l10n),
            enabled: !state.isSubmitting,
            textInputAction: TextInputAction.done,
            autofillHints: const [AutofillHints.password],
            onChanged: (_) => viewModel.fieldChanged(password: true),
            onSubmitted: (_) => onSubmit(),
          ),
          // Where people look for it: right under the field it is about.
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: AppButton(
              key: const ValueKey('login-forgot-password'),
              label: l10n.loginForgotPassword,
              variant: AppButtonVariant.text,
              onPressed: () => showAppInfoDialog(
                context,
                title: l10n.loginForgotPasswordTitle,
                message: l10n.loginForgotPasswordMessage,
                closeLabel: l10n.commonClose,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            key: const ValueKey('login-submit'),
            label: l10n.loginSubmit,
            loadingLabel: l10n.loginSubmitting,
            icon: AppIcons.signIn,
            isLoading: state.isSubmitting,
            onPressed: onSubmit,
            expand: true,
          ),
        ],
      ),
    );
  }
}

/// Sample-data mode only: says plainly that sign-in is not checked.
class _DemoNotice extends StatelessWidget {
  const _DemoNotice();

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Semantics(
      container: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: AppRadius.mdAll,
          border: Border.all(color: context.semanticColors.info.withValues(alpha: 0.4)),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ExcludeSemantics(child: Icon(AppIcons.info, size: 20, color: context.semanticColors.info)),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  context.l10n.loginDemoNotice,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colors.onSurface),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Brand mark, name and tagline. The name is the page's heading.
class _Brand extends StatelessWidget {
  const _Brand();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colors = context.colors;
    final text = Theme.of(context).textTheme;
    return Column(
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: context.semanticColors.brandNavy,
            borderRadius: AppRadius.lgAll,
            boxShadow: AppShadows.md,
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: ExcludeSemantics(child: Icon(AppIcons.brand, size: 32, color: colors.secondary)),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Semantics(
          header: true,
          child: Text(
            l10n.appTitle,
            style: text.headlineMedium?.copyWith(color: colors.primary, fontWeight: FontWeight.w700),
            textAlign: TextAlign.center,
          ),
        ),
        const SizedBox(height: AppSpacing.xxs),
        Text(
          l10n.appSubtitle,
          style: text.bodyMedium?.copyWith(color: context.semanticColors.mutedText),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer();

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Text(
      context.l10n.loginFooter(DateTime.now().year.toString()),
      style: text.bodySmall?.copyWith(color: context.colors.onSurface),
      textAlign: TextAlign.center,
    );
  }
}
