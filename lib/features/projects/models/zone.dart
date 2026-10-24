import 'package:flutter/foundation.dart';

/// A sellable or shared space on a floor.
enum UnitKind { flat, shop, office, amenity }

/// Construction stage of a unit, shown in the zone inspector.
enum UnitStage { structure, finishing, ready }

/// A room inside a unit, or an area inside an amenity (data, as named on
/// the drawings).
@immutable
class Room {
  const Room({required this.name, this.areaSqFt});

  final String name;
  final int? areaSqFt;
}

@immutable
class Unit {
  const Unit({required this.label, required this.kind, required this.stage, required this.rooms, this.layout});

  /// e.g. "A-1203", "Shop G-04", "Clubhouse".
  final String label;
  final UnitKind kind;
  final UnitStage stage;

  /// e.g. "3 BHK" (flats only).
  final String? layout;
  final List<Room> rooms;
}

@immutable
class Floor {
  const Floor({required this.level, required this.units});

  /// 0 is the ground floor.
  final int level;
  final List<Unit> units;
}

@immutable
class Tower {
  const Tower({required this.name, required this.floors});

  final String name;
  final List<Floor> floors;

  int get unitCount => floors.fold(0, (sum, f) => sum + f.units.length);
}
