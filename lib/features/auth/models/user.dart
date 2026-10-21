import 'package:flutter/foundation.dart';

import '../../../core/network/json.dart';

/// Roles defined by the API (`src/common/constants/roles.ts` on the backend
/// branch). [unknown] keeps the app working if the server adds a role.
enum UserRole {
  owner('owner'),
  generalManager('general_manager'),
  constructionHead('construction_head'),
  projectManager('project_manager'),
  siteEngineer('site_engineer'),
  supervisor('supervisor'),
  storeKeeper('store_keeper'),
  accountant('accountant'),
  unknown('unknown');

  const UserRole(this.apiValue);

  final String apiValue;

  static UserRole fromApi(String value) => values.firstWhere((role) => role.apiValue == value, orElse: () => unknown);
}

/// The signed-in staff member (`UserDto` in the API).
@immutable
class User {
  const User({
    required this.id,
    required this.username,
    required this.displayName,
    required this.role,
    required this.isActive,
    required this.lastLoginAt,
    required this.createdAt,
  });

  factory User.fromJson(JsonMap json) => User(
    id: json.string('id'),
    username: json.string('username'),
    displayName: json.string('displayName'),
    role: UserRole.fromApi(json.string('role')),
    isActive: json.string('status') == 'active',
    lastLoginAt: json.dateTimeOrNull('lastLoginAt'),
    createdAt: json.dateTime('createdAt'),
  );

  final String id;
  final String username;
  final String displayName;
  final UserRole role;
  final bool isActive;
  final DateTime? lastLoginAt;
  final DateTime createdAt;

  @override
  bool operator ==(Object other) =>
      other is User &&
      other.id == id &&
      other.username == username &&
      other.displayName == displayName &&
      other.role == role &&
      other.isActive == isActive &&
      other.lastLoginAt == lastLoginAt &&
      other.createdAt == createdAt;

  @override
  int get hashCode => Object.hash(id, username, displayName, role, isActive, lastLoginAt, createdAt);
}
