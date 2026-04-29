-- Now that 'training' is committed to the enum, reclassify the training
-- app and correct the Identity Command Center base URL to the live domain.
UPDATE "AppRegistry" SET category = 'training' WHERE "appKey" = 'training';
UPDATE "AppRegistry"
SET "baseUrl" = 'https://www.suite.mactechsolutionsllc.com'
WHERE "appKey" = 'identity-command-center';
