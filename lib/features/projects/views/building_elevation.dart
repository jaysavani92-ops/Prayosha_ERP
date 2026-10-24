import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/l10n/app_language.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_tokens.dart';
import '../models/project.dart';

/// The project drawn as its own elevation, like an architect's sheet: one
/// solid form per tower with fine floor lines and bays, floors still to
/// build as an outlined frame, and the slab cast most recently in amber. Towers share one scale within a project, so a podium reads lower
/// than the towers beside it. Data-driven, so it needs no
/// photographs (and invents none).
class BuildingElevation extends StatelessWidget {
  const BuildingElevation({super.key, required this.project, this.topInset = AppSpacing.lg, this.onDark = false});

  final Project project;

  /// Space kept above the tallest tower (e.g. for badges over the drawing).
  final double topInset;

  /// Drawn in light lines on the caller's dark (navy) panel, with no
  /// background of its own.
  final bool onDark;

  /// Towers fill the panel's height, but a low-rise project is never drawn
  /// taller than a building of this many floors.
  static const minScaleFloors = 12;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final built = project.towers.fold(0, (sum, t) => sum + t.floorsBuilt);
    return Semantics(
      image: true,
      label: context.l10n.projectElevationLabel(project.name, built, project.totalFloors),
      child: ExcludeSemantics(
        child: DecoratedBox(
          decoration: BoxDecoration(color: onDark ? null : colors.surfaceContainerLow),
          child: CustomPaint(
            painter: _ElevationPainter(
              towers: project.towers,
              topInset: topInset,
              completed: project.status == ProjectStatus.completed,
              built: onDark ? AppGlass.highlight.withValues(alpha: 0.86) : colors.primary,
              current: colors.secondary,
              outline: onDark ? AppGlass.highlight.withValues(alpha: 0.4) : colors.outline,
              ground: onDark ? AppGlass.highlight.withValues(alpha: 0.24) : colors.outlineVariant,
              lines: onDark
                  ? context.semanticColors.brandNavy.withValues(alpha: 0.55)
                  : colors.surfaceContainerLow.withValues(alpha: 0.7),
              // A faint blueprint grid on dark panels.
              grid: onDark ? AppGlass.highlight.withValues(alpha: 0.05) : null,
            ),
          ),
        ),
      ),
    );
  }
}

class _ElevationPainter extends CustomPainter {
  _ElevationPainter({
    required this.towers,
    required this.topInset,
    required this.completed,
    required this.built,
    required this.current,
    required this.outline,
    required this.ground,
    required this.lines,
    this.grid,
  });

  final List<TowerSpec> towers;
  final double topInset;
  final bool completed;

  /// Cast floors, the latest slab, floors still to build, the ground line.
  final Color built;
  final Color current;
  final Color outline;
  final Color ground;

  /// Floor lines and bays drawn over the cast part (the panel colour, so
  /// they read as gaps).
  final Color lines;

  /// Blueprint grid behind the drawing; none when null.
  final Color? grid;

  static const _gridStep = AppSpacing.lg;

  @override
  void paint(Canvas canvas, Size size) {
    if (towers.isEmpty || size.isEmpty) return;
    final grid = this.grid;
    if (grid != null) {
      final paint = Paint()
        ..color = grid
        ..strokeWidth = 1;
      for (var x = _gridStep; x < size.width; x += _gridStep) {
        canvas.drawLine(Offset(x, 0), Offset(x, size.height), paint);
      }
      for (var y = _gridStep; y < size.height; y += _gridStep) {
        canvas.drawLine(Offset(0, y), Offset(size.width, y), paint);
      }
    }

    final groundY = size.height - AppSpacing.md;
    final top = topInset;
    final scaleFloors = math.max(BuildingElevation.minScaleFloors, towers.map((t) => t.floors).reduce(math.max));
    final floorHeight = (groundY - top) / scaleFloors;

    // Towers sit centred, each no wider than a quarter of the panel.
    const gap = AppSpacing.md;
    final towerWidth = math.min(size.width / 4, (size.width * 0.8 - gap * (towers.length - 1)) / towers.length);
    final totalWidth = towerWidth * towers.length + gap * (towers.length - 1);
    var x = (size.width - totalWidth) / 2;

    final solid = Paint()..color = built;
    final slab = Paint()..color = current;
    final frame = Paint()
      ..color = outline
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    final gapLine = Paint()
      ..color = lines
      ..strokeWidth = 1;
    final pendingLine = Paint()
      ..color = outline.withValues(alpha: outline.a * 0.45)
      ..strokeWidth = 1;
    // Bays (vertical window columns) once a tower is wide enough to show them.
    final bays = towerWidth >= AppSpacing.xxxl ? 3 : (towerWidth >= AppSpacing.xl ? 2 : 1);

    for (final tower in towers) {
      final builtFloors = completed ? tower.floors : tower.floorsBuilt;
      final builtTop = groundY - builtFloors * floorHeight;
      final towerTop = groundY - tower.floors * floorHeight;

      // Floors still to build: an outlined frame with faint floor lines.
      if (builtFloors < tower.floors) {
        canvas.drawRect(Rect.fromLTRB(x + 0.5, towerTop + 0.5, x + towerWidth - 0.5, builtTop), frame);
        for (var level = builtFloors + 1; level < tower.floors; level++) {
          final y = groundY - level * floorHeight;
          canvas.drawLine(Offset(x + 1, y), Offset(x + towerWidth - 1, y), pendingLine);
        }
      }

      // Cast floors: a solid form, with floor lines and bays as fine gaps.
      if (builtFloors > 0) {
        canvas.drawRect(Rect.fromLTRB(x, builtTop, x + towerWidth, groundY), solid);
        if (floorHeight >= 3) {
          for (var level = 1; level < builtFloors; level++) {
            final y = groundY - level * floorHeight;
            canvas.drawLine(Offset(x, y), Offset(x + towerWidth, y), gapLine);
          }
        }
        for (var bay = 1; bay < bays; bay++) {
          final bx = x + towerWidth * bay / bays;
          canvas.drawLine(Offset(bx, builtTop), Offset(bx, groundY), gapLine);
        }
        // The slab cast most recently, while the tower is still rising.
        if (builtFloors < tower.floors) {
          canvas.drawRect(
            Rect.fromLTRB(x, builtTop, x + towerWidth, builtTop + math.max(2.5, floorHeight * 0.4)),
            slab,
          );
        }
      }
      x += towerWidth + gap;
    }

    canvas.drawLine(
      Offset(0, groundY + 0.5),
      Offset(size.width, groundY + 0.5),
      Paint()
        ..color = ground
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(_ElevationPainter old) =>
      old.towers != towers ||
      old.topInset != topInset ||
      old.completed != completed ||
      old.built != built ||
      old.current != current ||
      old.outline != outline ||
      old.ground != ground ||
      old.lines != lines ||
      old.grid != grid;
}
