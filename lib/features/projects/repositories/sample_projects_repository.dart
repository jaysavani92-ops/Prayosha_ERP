import '../models/project.dart';
import '../models/zone.dart';
import 'projects_repository.dart';

/// Realistic sample portfolio (six Gujarat sites), dated relative to today.
/// No network. Replaced by an API-backed repository when one exists.
class SampleProjectsRepository implements ProjectsRepository {
  SampleProjectsRepository({this.latency = const Duration(milliseconds: 400)});

  /// Simulated load time, so loading states are visible in the preview.
  final Duration latency;

  static const _crore = 10000000.0;

  @override
  Future<ProjectDirectory> directory() async {
    await Future<void>.delayed(latency);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    DateTime months(int n) => DateTime(today.year, today.month + n, today.day);

    return ProjectDirectory(
      projects: [
        Project(
          id: 'prj-014',
          code: 'PRSG-006',
          createdAt: months(-20),
          name: 'Shivalay Heights',
          kind: ProjectKind.residential,
          address: 'Science City Road, Sola',
          city: 'Ahmedabad',
          status: ProjectStatus.inProgress,
          health: ScheduleHealth.onTrack,
          budget: 86.5 * _crore,
          spent: 51.2 * _crore,
          areaSqFt: 412000,
          progress: 0.62,
          startDate: months(-19),
          handoverDate: months(20),
          towers: const [
            TowerSpec(name: 'Tower A', floors: 14, floorsBuilt: 14),
            TowerSpec(name: 'Tower B', floors: 14, floorsBuilt: 11),
            TowerSpec(name: 'Tower C', floors: 12, floorsBuilt: 6),
          ],
          workspace: const WorkspaceStats(
            openTasks: 38,
            lowStockItems: 3,
            crewOnSite: 146,
            pendingApprovals: 2,
            delayedTasks: 1,
          ),
          highlights: const [
            'Tower B 11th floor slab cast',
            'Tower A plastering done up to 9th floor',
            'Lift shaft work started in Tower C',
          ],
        ),
        Project(
          id: 'prj-007',
          code: 'PRSG-003',
          createdAt: months(-31),
          name: 'Prayosha Business Hub',
          kind: ProjectKind.commercial,
          address: 'Ring Road, Majura Gate',
          city: 'Surat',
          status: ProjectStatus.inProgress,
          health: ScheduleHealth.delayed,
          budget: 54 * _crore,
          spent: 41.8 * _crore,
          areaSqFt: 268000,
          progress: 0.71,
          startDate: months(-30),
          handoverDate: months(4),
          towers: const [TowerSpec(name: 'Block 1', floors: 10, floorsBuilt: 10)],
          workspace: const WorkspaceStats(
            openTasks: 54,
            lowStockItems: 7,
            crewOnSite: 92,
            pendingApprovals: 5,
            delayedTasks: 5,
          ),
          highlights: const [
            'Glass facade fixed on floors 1 to 6',
            'Fire NOC inspection rescheduled',
            'HVAC ducting 40% complete',
          ],
        ),
        Project(
          id: 'prj-021',
          code: 'PRSG-005',
          createdAt: months(-12),
          name: 'Narmada Residency',
          kind: ProjectKind.residential,
          address: 'Gotri–Sevasi Road',
          city: 'Vadodara',
          status: ProjectStatus.inProgress,
          health: ScheduleHealth.atRisk,
          budget: 42.75 * _crore,
          spent: 18.9 * _crore,
          areaSqFt: 236500,
          progress: 0.38,
          startDate: months(-11),
          handoverDate: months(17),
          towers: const [
            TowerSpec(name: 'Tower A', floors: 11, floorsBuilt: 5),
            TowerSpec(name: 'Tower B', floors: 11, floorsBuilt: 3),
          ],
          workspace: const WorkspaceStats(
            openTasks: 27,
            lowStockItems: 5,
            crewOnSite: 74,
            pendingApprovals: 3,
            delayedTasks: 3,
          ),
          highlights: const ['Tower A 5th floor slab cast', 'Steel delivery delayed by 6 days'],
        ),
        Project(
          id: 'prj-003',
          code: 'PRSG-007',
          createdAt: months(-2),
          name: 'Sabarmati Riverside Towers',
          kind: ProjectKind.mixedUse,
          address: 'Sector 21, near Sarita Udyan',
          city: 'Gandhinagar',
          status: ProjectStatus.planning,
          health: ScheduleHealth.onTrack,
          budget: 128 * _crore,
          spent: 3.4 * _crore,
          areaSqFt: 610000,
          progress: 0.04,
          startDate: months(2),
          handoverDate: months(42),
          towers: const [
            TowerSpec(name: 'Podium', floors: 3, floorsBuilt: 0),
            TowerSpec(name: 'Tower A', floors: 22, floorsBuilt: 0),
            TowerSpec(name: 'Tower B', floors: 22, floorsBuilt: 0),
          ],
          workspace: const WorkspaceStats(
            openTasks: 12,
            lowStockItems: 0,
            crewOnSite: 18,
            pendingApprovals: 9,
            delayedTasks: 0,
          ),
          highlights: const ['Soil testing report received', 'RERA registration filed'],
        ),
        Project(
          id: 'prj-011',
          code: 'PRSG-004',
          createdAt: months(-15),
          name: 'Shreeji Arcade',
          kind: ProjectKind.commercial,
          address: '150 Feet Ring Road, Nana Mava',
          city: 'Rajkot',
          status: ProjectStatus.onHold,
          health: ScheduleHealth.atRisk,
          budget: 23.6 * _crore,
          spent: 9.1 * _crore,
          areaSqFt: 98000,
          progress: 0.33,
          startDate: months(-14),
          handoverDate: months(12),
          towers: const [TowerSpec(name: 'Block 1', floors: 6, floorsBuilt: 2)],
          workspace: const WorkspaceStats(
            openTasks: 6,
            lowStockItems: 1,
            crewOnSite: 0,
            pendingApprovals: 4,
            delayedTasks: 2,
          ),
          highlights: const ['Work paused pending revised plan approval'],
        ),
        Project(
          id: 'prj-009',
          code: 'PRSG-001',
          createdAt: months(-45),
          name: 'Prayosha Greens Phase I',
          kind: ProjectKind.residential,
          address: 'SG Highway, Gota',
          city: 'Ahmedabad',
          status: ProjectStatus.completed,
          health: ScheduleHealth.onTrack,
          budget: 64.2 * _crore,
          spent: 62.9 * _crore,
          areaSqFt: 355000,
          progress: 1,
          startDate: months(-44),
          handoverDate: months(-3),
          towers: const [
            TowerSpec(name: 'Tower A', floors: 12, floorsBuilt: 12),
            TowerSpec(name: 'Tower B', floors: 12, floorsBuilt: 12),
          ],
          workspace: const WorkspaceStats(
            openTasks: 4,
            lowStockItems: 0,
            crewOnSite: 11,
            pendingApprovals: 0,
            delayedTasks: 0,
          ),
          highlights: const ['Snag list closed for 186 of 192 flats'],
        ),
      ],
    );
  }

  @override
  Future<List<Tower>> zones(Project project) async {
    await Future<void>.delayed(latency);
    return [for (final spec in project.towers) _tower(project, spec)];
  }

  static Tower _tower(Project project, TowerSpec spec) {
    final prefix = spec.name.split(' ').last;
    final podium = spec.name == 'Podium';
    final commercial = project.kind == ProjectKind.commercial || podium;

    UnitStage stage(int level) {
      if (project.status == ProjectStatus.completed) return UnitStage.ready;
      if (level >= spec.floorsBuilt) return UnitStage.structure;
      return level < spec.floorsBuilt ~/ 2 ? UnitStage.finishing : UnitStage.structure;
    }

    Floor floor(int level) {
      final units = <Unit>[];
      if (level == 0 && !commercial) {
        units.add(Unit(label: 'Entrance lobby $prefix', kind: UnitKind.amenity, stage: stage(0), rooms: _lobby));
        if (prefix == 'A') {
          units.add(Unit(label: 'Clubhouse', kind: UnitKind.amenity, stage: stage(0), rooms: _clubhouse));
        }
      } else if (level == 0 || podium) {
        for (var i = 1; i <= 6; i++) {
          final number = i.toString().padLeft(2, '0');
          units.add(
            Unit(
              label: 'Shop ${podium ? 'P$level' : 'G'}-$number',
              kind: UnitKind.shop,
              stage: stage(level),
              rooms: _shop,
            ),
          );
        }
      } else {
        for (var i = 1; i <= 4; i++) {
          final label = '$prefix-$level${i.toString().padLeft(2, '0')}';
          if (commercial) {
            units.add(Unit(label: 'Office $label', kind: UnitKind.office, stage: stage(level), rooms: _office));
          } else {
            final large = i.isEven;
            units.add(
              Unit(
                label: label,
                kind: UnitKind.flat,
                stage: stage(level),
                layout: large ? '3 BHK' : '2 BHK',
                rooms: large ? _threeBhk : _twoBhk,
              ),
            );
          }
        }
      }
      return Floor(level: level, units: units);
    }

    return Tower(name: spec.name, floors: [for (var level = 0; level < spec.floors; level++) floor(level)]);
  }

  static const _twoBhk = [
    Room(name: 'Living room', areaSqFt: 210),
    Room(name: 'Kitchen', areaSqFt: 90),
    Room(name: 'Master bedroom', areaSqFt: 160),
    Room(name: 'Bedroom 2', areaSqFt: 130),
    Room(name: 'Toilets (2)', areaSqFt: 80),
    Room(name: 'Balcony', areaSqFt: 50),
  ];
  static const _threeBhk = [
    Room(name: 'Living and dining', areaSqFt: 290),
    Room(name: 'Kitchen with utility', areaSqFt: 120),
    Room(name: 'Master bedroom', areaSqFt: 180),
    Room(name: 'Bedroom 2', areaSqFt: 140),
    Room(name: 'Bedroom 3', areaSqFt: 125),
    Room(name: 'Toilets (3)', areaSqFt: 120),
    Room(name: 'Balconies (2)', areaSqFt: 95),
  ];
  static const _shop = [
    Room(name: 'Sales floor', areaSqFt: 420),
    Room(name: 'Storage', areaSqFt: 80),
    Room(name: 'Toilet', areaSqFt: 30),
  ];
  static const _office = [
    Room(name: 'Open workspace', areaSqFt: 900),
    Room(name: 'Cabins (2)', areaSqFt: 220),
    Room(name: 'Meeting room', areaSqFt: 160),
    Room(name: 'Pantry', areaSqFt: 70),
  ];
  static const _lobby = [Room(name: 'Reception'), Room(name: 'Lift lobby'), Room(name: 'Fire control room')];
  static const _clubhouse = [
    Room(name: 'Gymnasium', areaSqFt: 1200),
    Room(name: 'Multipurpose hall', areaSqFt: 2400),
    Room(name: 'Indoor games', areaSqFt: 800),
    Room(name: 'Swimming pool deck'),
  ];
}
