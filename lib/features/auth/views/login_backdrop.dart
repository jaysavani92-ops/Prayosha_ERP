import 'package:flutter/material.dart';

import '../../../core/assets/app_assets.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_tokens.dart';

/// Full-bleed site photograph behind the sign-in card, under a navy scrim.
///
/// The photo is portrait. `BoxFit.cover` crops it differently per window:
///  - portrait phones fit its height, so only the horizontal focus matters:
///    x = 0.4 keeps the engineer's Prayosha hard hat in frame;
///  - landscape windows fit its width, so only the vertical focus matters:
///    y = 0.3 shows the band with the crane and sunset behind the card.
///
/// The scrim is strongest at the top (status pills) and bottom (footer,
/// card on phones) and lightest in the middle, where the photo carries.
class LoginBackdrop extends StatelessWidget {
  const LoginBackdrop({super.key});

  static const _focus = Alignment(0.4, 0.3);

  @override
  Widget build(BuildContext context) {
    final scrim = context.semanticColors.brandNavy;
    final reduceMotion = MediaQuery.disableAnimationsOf(context);

    // Never repaints when the form above it changes.
    return RepaintBoundary(
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Shown while the photo decodes, or if it ever fails to load.
          ColoredBox(color: scrim),
          Image.asset(
            AppImages.loginBackground,
            fit: BoxFit.cover,
            alignment: _focus,
            filterQuality: FilterQuality.medium,
            excludeFromSemantics: true,
            frameBuilder: (context, child, frame, wasSynchronouslyLoaded) => wasSynchronouslyLoaded
                ? child
                : AnimatedOpacity(
                    opacity: frame == null ? 0 : 1,
                    duration: reduceMotion ? Duration.zero : AppDurations.slow,
                    curve: Curves.easeOut,
                    child: child,
                  ),
            errorBuilder: (_, _, _) => const SizedBox.shrink(),
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: const [0, 0.3, 0.65, 1],
                colors: [
                  scrim.withValues(alpha: 0.6),
                  scrim.withValues(alpha: 0.15),
                  scrim.withValues(alpha: 0.35),
                  scrim.withValues(alpha: 0.85),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
