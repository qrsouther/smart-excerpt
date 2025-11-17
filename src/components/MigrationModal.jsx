import React, { useState } from 'react';
import {
  Text,
  Strong,
  Button,
  Box,
  Modal,
  ModalTransition,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  Stack,
  Inline,
  SectionMessage
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { StableTextfield } from './common/StableTextfield';

/**
 * Migration Modal Component
 *
 * Handles the 4-step migration process from MultiExcerpt to Blueprint Standard:
 * 1. Clone Blueprint Standard Source macros
 * 2. Migrate content from MultiExcerpt
 * 3. Fix excerpt IDs (generate unique UUIDs)
 * 4. Initialize Forge storage
 */
export const MigrationModal = ({ isOpen, onClose, defaultPageId = '99909654' }) => {
  const [migrationPageId, setMigrationPageId] = useState(defaultPageId);
  const [step1Running, setStep1Running] = useState(false);
  const [step1Result, setStep1Result] = useState(null);
  const [step2Running, setStep2Running] = useState(false);
  const [step2Result, setStep2Result] = useState(null);
  const [step3Running, setStep3Running] = useState(false);
  const [step3Result, setStep3Result] = useState(null);
  const [step4Running, setStep4Running] = useState(false);
  const [step4Result, setStep4Result] = useState(null);

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={onClose} width="large">
          <ModalHeader>
            <ModalTitle>MultiExcerpt to Blueprint Standard Migration</ModalTitle>
          </ModalHeader>
          <ModalBody>
            <Stack space="space.150">
              <Box>
                <Text>
                  <Strong>Page ID to migrate:</Strong>
                </Text>
                <StableTextfield
                  stableKey="migration-page-id"
                  placeholder="Enter Confluence Page ID (e.g., 99909654)"
                  value={migrationPageId}
                  onChange={(e) => setMigrationPageId(e.target.value)}
                  width="full"
                />
              </Box>

              <SectionMessage appearance="information">
                <Text>
                  This migration tool will convert all MultiExcerpt macros on the specified page to Blueprint Standard Source macros.
                  Complete all 4 steps in order. <Strong>No API tokens required!</Strong>
                </Text>
              </SectionMessage>

              {/* Step 1: Clone Macros */}
              <Box>
                <Stack space="space.100">
                  <Inline space="space.100" alignBlock="center" spread="space-between">
                    <Text>
                      <Strong>Step 1: Clone Blueprint Standard Source Macros</Strong>
                    </Text>
                    <Button
                      appearance="primary"
                      isDisabled={step1Running || !migrationPageId}
                      onClick={async () => {
                        setStep1Running(true);
                        setStep1Result(null);
                        try {
                          const result = await invoke('migrateStep1CloneMacros', { pageId: migrationPageId });
                          setStep1Result(result);
                        } catch (error) {
                          setStep1Result({ success: false, error: error.message });
                        } finally {
                          setStep1Running(false);
                        }
                      }}
                    >
                      {step1Running ? 'Running...' : 'Run Step 1'}
                    </Button>
                  </Inline>
                  <Text>Creates N Blueprint Standard Source macros (one for each MultiExcerpt).</Text>
                  {step1Running && (
                    <SectionMessage appearance="information">
                      <Text>Step 1 is running... This may take a minute.</Text>
                    </SectionMessage>
                  )}
                  {step1Result && (
                    <SectionMessage appearance={step1Result.success ? "success" : "error"}>
                      <Text>
                        {step1Result.success
                          ? `✓ ${step1Result.message} (${step1Result.clonedCount} macros)`
                          : `✗ Error: ${step1Result.error}`}
                      </Text>
                    </SectionMessage>
                  )}
                </Stack>
              </Box>

              {/* Step 2: Migrate Content */}
              <Box>
                <Stack space="space.100">
                  <Inline space="space.100" alignBlock="center" spread="space-between">
                    <Text>
                      <Strong>Step 2: Migrate Content</Strong>
                    </Text>
                    <Button
                      appearance="primary"
                      isDisabled={step2Running || !migrationPageId}
                      onClick={async () => {
                        setStep2Running(true);
                        setStep2Result(null);
                        try {
                          const result = await invoke('migrateStep2MigrateContent', { pageId: migrationPageId });
                          setStep2Result(result);
                        } catch (error) {
                          setStep2Result({ success: false, error: error.message });
                        } finally {
                          setStep2Running(false);
                        }
                      }}
                    >
                      {step2Running ? 'Running...' : 'Run Step 2'}
                    </Button>
                  </Inline>
                  <Text>Copies content from MultiExcerpt to Blueprint Standard Source macros.</Text>
                  {step2Running && (
                    <SectionMessage appearance="information">
                      <Text>Step 2 is running... This may take a few minutes.</Text>
                    </SectionMessage>
                  )}
                  {step2Result && (
                    <SectionMessage appearance={step2Result.success ? "success" : "error"}>
                      <Text>
                        {step2Result.success
                          ? `✓ ${step2Result.message} (${step2Result.updatedCount} macros)`
                          : `✗ Error: ${step2Result.error}`}
                      </Text>
                    </SectionMessage>
                  )}
                </Stack>
              </Box>

              {/* Step 3: Fix Excerpt IDs */}
              <Box>
                <Stack space="space.100">
                  <Inline space="space.100" alignBlock="center" spread="space-between">
                    <Text>
                      <Strong>Step 3: Generate Unique IDs</Strong>
                    </Text>
                    <Button
                      appearance="primary"
                      isDisabled={step3Running || !migrationPageId}
                      onClick={async () => {
                        setStep3Running(true);
                        setStep3Result(null);
                        try {
                          const result = await invoke('migrateStep3FixExcerptIds', { pageId: migrationPageId });
                          setStep3Result(result);
                        } catch (error) {
                          setStep3Result({ success: false, error: error.message });
                        } finally {
                          setStep3Running(false);
                        }
                      }}
                    >
                      {step3Running ? 'Running...' : 'Run Step 3'}
                    </Button>
                  </Inline>
                  <Text>Assigns unique UUIDs to each Blueprint Standard Source macro.</Text>
                  {step3Running && (
                    <SectionMessage appearance="information">
                      <Text>Step 3 is running... This may take a minute.</Text>
                    </SectionMessage>
                  )}
                  {step3Result && (
                    <SectionMessage appearance={step3Result.success ? "success" : "error"}>
                      <Text>
                        {step3Result.success
                          ? `✓ ${step3Result.message} (${step3Result.updatedCount} macros)`
                          : `✗ Error: ${step3Result.error}`}
                      </Text>
                    </SectionMessage>
                  )}
                </Stack>
              </Box>

              {/* Step 4: Bulk Initialize */}
              <Box>
                <Stack space="space.100">
                  <Inline space="space.100" alignBlock="center" spread="space-between">
                    <Text>
                      <Strong>Step 4: Initialize Forge Storage</Strong>
                    </Text>
                    <Button
                      appearance="primary"
                      isDisabled={step4Running || !migrationPageId}
                      onClick={async () => {
                        setStep4Running(true);
                        setStep4Result(null);
                        try {
                          const result = await invoke('bulkInitializeAllExcerpts', { pageId: migrationPageId });
                          setStep4Result(result);
                        } catch (error) {
                          setStep4Result({ success: false, error: error.message });
                        } finally {
                          setStep4Running(false);
                        }
                      }}
                    >
                      {step4Running ? 'Running...' : 'Run Step 4'}
                    </Button>
                  </Inline>
                  <Text>Creates Forge storage entries so the Edit modal works correctly.</Text>
                  {step4Running && (
                    <SectionMessage appearance="information">
                      <Text>Step 4 is running... This may take a few minutes.</Text>
                    </SectionMessage>
                  )}
                  {step4Result && (
                    <SectionMessage appearance={step4Result.success ? "success" : "error"}>
                      <Text>
                        {step4Result.success
                          ? `✓ Initialized ${step4Result.successful} out of ${step4Result.total} Blueprint Standards`
                          : `✗ Error: ${step4Result.error}`}
                      </Text>
                    </SectionMessage>
                  )}
                </Stack>
              </Box>

              {/* Final Success Message */}
              {step4Result?.success && (
                <SectionMessage appearance="success">
                  <Stack space="space.100">
                    <Text>
                      <Strong>🎉 Migration Complete!</Strong>
                    </Text>
                    <Text>
                      All 4 steps completed successfully. You can now:
                    </Text>
                    <Text>1. Refresh the Confluence page to see your migrated Blueprint Standards</Text>
                    <Text>2. Test the Edit modal on a few macros</Text>
                    <Text>3. Delete the old MultiExcerpt macros (optional)</Text>
                  </Stack>
                </SectionMessage>
              )}
            </Stack>
          </ModalBody>
          <ModalFooter>
            <Button appearance="subtle" onClick={onClose}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </ModalTransition>
  );
};
