import 'package:flutter/material.dart';

import '../assets/app_assets.dart';

/// Text input with consistent labels, errors and an optional show/hide toggle
/// for secrets. Error text is supplied already localized by the caller.
class AppTextField extends StatefulWidget {
  const AppTextField({
    super.key,
    required this.label,
    this.controller,
    this.hint,
    this.errorText,
    this.prefixIcon,
    this.obscure = false,
    this.showSecretLabel,
    this.hideSecretLabel,
    this.keyboardType,
    this.textInputAction,
    this.autofillHints,
    this.onChanged,
    this.onSubmitted,
    this.enabled = true,
    this.autofocus = false,
    this.focusNode,
    this.suffix,
  });

  final String label;
  final TextEditingController? controller;
  final String? hint;
  final String? errorText;
  final IconData? prefixIcon;
  final bool obscure;

  /// Tooltips for the visibility toggle; required when [obscure] is true.
  final String? showSecretLabel;
  final String? hideSecretLabel;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final bool enabled;
  final bool autofocus;
  final FocusNode? focusNode;

  /// Trailing action (e.g. clear search). Ignored for [obscure] fields,
  /// which show the visibility toggle there.
  final Widget? suffix;

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  late bool _hidden = widget.obscure;

  @override
  Widget build(BuildContext context) {
    final toggle = widget.obscure
        ? IconButton(
            tooltip: _hidden ? widget.showSecretLabel : widget.hideSecretLabel,
            icon: Icon(_hidden ? AppIcons.visibilityOn : AppIcons.visibilityOff),
            onPressed: widget.enabled ? () => setState(() => _hidden = !_hidden) : null,
          )
        : null;

    return TextField(
      controller: widget.controller,
      focusNode: widget.focusNode,
      enabled: widget.enabled,
      autofocus: widget.autofocus,
      obscureText: _hidden,
      enableSuggestions: !widget.obscure,
      autocorrect: false,
      keyboardType: widget.keyboardType,
      textInputAction: widget.textInputAction,
      autofillHints: widget.autofillHints,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      decoration: InputDecoration(
        labelText: widget.label,
        hintText: widget.hint,
        errorText: widget.errorText,
        prefixIcon: widget.prefixIcon == null ? null : Icon(widget.prefixIcon),
        suffixIcon: toggle ?? widget.suffix,
      ),
    );
  }
}
