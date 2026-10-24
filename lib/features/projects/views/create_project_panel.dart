import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/l10n/app_language.dart';
import '../../../core/l10n/validation_messages.dart';
import '../../../core/theme/app_tokens.dart';
import '../../../core/validation/validators.dart';
import '../../../core/widgets/app_adaptive_panel.dart';
import '../../../core/widgets/app_button.dart';
import '../../../core/widgets/app_dialog.dart';
import '../../../core/widgets/app_text_field.dart';
import '../models/project.dart';
import '../viewmodels/project_directory_view_model.dart';
import 'project_labels.dart';

/// Opens the Create Project form (managers only; the caller checks).
Future<void> showCreateProject(BuildContext context) {
  final messenger = ScaffoldMessenger.of(context);
  return showAppAdaptivePanel<void>(
    context,
    maxWidth: AppSpacing.formMaxWidth + AppSpacing.xxxl,
    builder: (context, isSheet) => CreateProjectPanel(
      showClose: !isSheet,
      onCreated: (name) => showAppSnackBarOn(messenger, context.l10n.created(name)),
    ),
  );
}

/// Name, city and type: enough to start a project in planning. The project
/// joins this session's list (there is no projects API to save to yet).
class CreateProjectPanel extends ConsumerStatefulWidget {
  const CreateProjectPanel({super.key, required this.onCreated, this.showClose = false});

  final ValueChanged<String> onCreated;
  final bool showClose;

  @override
  ConsumerState<CreateProjectPanel> createState() => _CreateProjectPanelState();
}

class _CreateProjectPanelState extends ConsumerState<CreateProjectPanel> {
  final _name = TextEditingController();
  final _city = TextEditingController();
  final _cityFocus = FocusNode();
  ProjectKind _kind = ProjectKind.residential;
  ValidationError? _nameError;
  ValidationError? _cityError;

  @override
  void dispose() {
    _name.dispose();
    _city.dispose();
    _cityFocus.dispose();
    super.dispose();
  }

  void _submit() {
    setState(() {
      _nameError = Validators.required(_name.text);
      _cityError = Validators.required(_city.text);
    });
    if (_nameError != null || _cityError != null) return;
    final project = ref
        .read(projectDirectoryViewModelProvider.notifier)
        .create(name: _name.text, city: _city.text, kind: _kind);
    Navigator.of(context).pop();
    widget.onCreated(project.name);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final text = Theme.of(context).textTheme;
    return SingleChildScrollView(
      key: const ValueKey('create-project'),
      // Clear of the on-screen keyboard when the form is a bottom sheet.
      padding: EdgeInsets.fromLTRB(
        AppSpacing.xl,
        widget.showClose ? AppSpacing.xl : 0,
        AppSpacing.xl,
        AppSpacing.xl + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(l10n.createTitle, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                ),
              ),
              if (widget.showClose)
                IconButton(
                  tooltip: l10n.commonClose,
                  icon: const Icon(AppIcons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          AppTextField(
            key: const ValueKey('create-name'),
            controller: _name,
            label: l10n.createName,
            autofocus: true,
            errorText: _nameError?.message(l10n),
            textInputAction: TextInputAction.next,
            onSubmitted: (_) => _cityFocus.requestFocus(),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            key: const ValueKey('create-city'),
            controller: _city,
            focusNode: _cityFocus,
            label: l10n.createCity,
            prefixIcon: AppIcons.location,
            errorText: _cityError?.message(l10n),
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _submit(),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(l10n.createKind, style: text.labelLarge),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final kind in ProjectKind.values)
                ChoiceChip(
                  label: Text(kind.label(l10n)),
                  selected: _kind == kind,
                  onSelected: (_) => setState(() => _kind = kind),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          AppButton(
            key: const ValueKey('create-submit'),
            label: l10n.projectsCreate,
            icon: AppIcons.add,
            onPressed: _submit,
            expand: true,
          ),
        ],
      ),
    );
  }
}
