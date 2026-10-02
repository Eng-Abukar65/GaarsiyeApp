import 'package:flutter_test/flutter_test.dart';

import 'package:deliveryapp/features/customers/presentation/models/profile_model.dart';

void main() {
  test('new customer profile does not use a mock photo', () {
    expect(ProfileModel.dummyProfile.photoUrl, isNull);
  });
}
