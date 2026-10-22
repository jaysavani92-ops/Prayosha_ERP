import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/app_config.dart';
import '../../../core/network/api_failure.dart';
import '../../../core/validation/validators.dart';
import 'auth_controller.dart';

@immutable
class LoginState {
  const LoginState({this.usernameError, this.passwordError, this.isSubmitting = false, this.failure});

  final ValidationError? usernameError;
  final ValidationError? passwordError;
  final bool isSubmitting;

  /// Last submission failure (an [ApiFailure] or unexpected error).
  final Object? failure;

  LoginState copyWith({
    ValidationError? Function()? usernameError,
    ValidationError? Function()? passwordError,
    bool? isSubmitting,
    Object? Function()? failure,
  }) {
    return LoginState(
      usernameError: usernameError != null ? usernameError() : this.usernameError,
      passwordError: passwordError != null ? passwordError() : this.passwordError,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      failure: failure != null ? failure() : this.failure,
    );
  }
}

/// Validates and submits the sign-in form. Navigation is not done here: the
/// router reacts to [authControllerProvider] becoming signed in.
class LoginViewModel extends Notifier<LoginState> {
  @override
  LoginState build() => const LoginState();

  /// In sample-data mode ([demoModeProvider]) there is nothing to check
  /// against, so validation is skipped and any input signs in.
  Future<void> submit({required String username, required String password}) async {
    if (state.isSubmitting) return;
    if (!ref.read(demoModeProvider)) {
      final usernameError = Validators.username(username);
      final passwordError = Validators.required(password);
      state = LoginState(usernameError: usernameError, passwordError: passwordError);
      if (usernameError != null || passwordError != null) return;
    } else {
      state = const LoginState();
    }

    state = state.copyWith(isSubmitting: true);
    try {
      await ref
          .read(authControllerProvider.notifier)
          .signIn(username: Validators.normalizeUsername(username), password: password);
      if (!ref.mounted) return;
      state = const LoginState();
    } on ApiFailure catch (failure) {
      if (!ref.mounted) return;
      state = state.copyWith(isSubmitting: false, failure: () => failure);
    } catch (error) {
      if (!ref.mounted) return;
      state = state.copyWith(isSubmitting: false, failure: () => error);
    }
  }

  /// Clears a field's error as soon as the user edits it.
  void fieldChanged({bool username = false, bool password = false}) {
    if ((username && state.usernameError != null) ||
        (password && state.passwordError != null) ||
        state.failure != null) {
      state = state.copyWith(
        usernameError: username ? () => null : null,
        passwordError: password ? () => null : null,
        failure: () => null,
      );
    }
  }
}

final loginViewModelProvider = NotifierProvider.autoDispose<LoginViewModel, LoginState>(LoginViewModel.new);
