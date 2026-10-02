class ProfileModel {
  final String name;
  final String email;
  final String phone;
  final String? photoUrl;
  final int totalRefills;
  final String fuelDelivered;
  final String status;
  final String? gender;

  ProfileModel({
    required this.name,
    required this.email,
    required this.phone,
    this.photoUrl,
    required this.totalRefills,
    required this.fuelDelivered,
    required this.status,
    this.gender,
  });

  static ProfileModel get dummyProfile => ProfileModel(
    name: 'Customer',
    email: '',
    phone: '',
    photoUrl: null,
    totalRefills: 0,
    fuelDelivered: '0L',
    status: 'Inactive',
    gender: null,
  );
}
