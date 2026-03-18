ALTER TABLE markets
  DROP CONSTRAINT IF EXISTS markets_category_check;

ALTER TABLE markets
  ADD CONSTRAINT markets_category_check CHECK (
    category IN (
      'autonomy',
      'robotaxi',
      'robotics',
      'vehicle',
      'consumer_hardware',
      'software_release',
      'developer_tool',
      'transport',
      'space',
      'social',
      'ai',
      'neurotech',
      'energy',
      'government'
    )
  );
