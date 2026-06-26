import React, { useState, useEffect, useCallback } from 'react';
import {
  PageSection,
  Title,
  Button,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  Alert,
  Spinner,
  Bullseye,
  Split,
  SplitItem,
  Panel,
  PanelMain,
  PanelMainBody,
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@patternfly/react-core';
import { SyncIcon } from '@patternfly/react-icons';
import { HermesInstance, CreateInstanceRequest } from '../types';
import { listInstances, createInstance, deleteInstance } from '../api/instanceApi';
import InstanceList from './InstanceList';
import InstanceCreateModal from './InstanceCreateModal';
import InstanceDetail from './InstanceDetail';

const POLL_INTERVAL = 10000;

const HermesDeployerPage: React.FC = () => {
  const [instances, setInstances] = useState<HermesInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<HermesInstance | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HermesInstance | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await listInstances();
      setInstances(data);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load instances');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleCreate = async (req: CreateInstanceRequest) => {
    await createInstance(req);
    await refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInstance(deleteTarget.name, deleteTarget.namespace);
      setDeleteTarget(null);
      if (selectedInstance?.name === deleteTarget.name && selectedInstance?.namespace === deleteTarget.namespace) {
        setSelectedInstance(null);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete instance');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageSection>
      <Title headingLevel="h1" style={{ marginBottom: 16 }}>Hermes Agent Deployer</Title>

      {error && <Alert variant="danger" title={error} isInline style={{ marginBottom: 16 }} />}

      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
              Deploy New Instance
            </Button>
          </ToolbarItem>
          <ToolbarItem>
            <Button variant="plain" onClick={refresh} aria-label="Refresh">
              <SyncIcon />
            </Button>
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      {loading ? (
        <Bullseye><Spinner /></Bullseye>
      ) : (
        <Split hasGutter>
          <SplitItem isFilled>
            <InstanceList
              instances={instances}
              onDelete={setDeleteTarget}
              onDeploy={() => setCreateModalOpen(true)}
              loading={loading}
            />
          </SplitItem>
          {selectedInstance && (
            <SplitItem style={{ width: 400 }}>
              <Panel>
                <PanelMain>
                  <PanelMainBody>
                    <InstanceDetail
                      instance={selectedInstance}
                      onDelete={setDeleteTarget}
                      onClose={() => setSelectedInstance(null)}
                    />
                  </PanelMainBody>
                </PanelMain>
              </Panel>
            </SplitItem>
          )}
        </Split>
      )}

      <InstanceCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreate}
      />

      {deleteTarget && (
        <Modal variant={ModalVariant.small} isOpen onClose={() => setDeleteTarget(null)}>
          <ModalHeader title="Delete Instance" />
          <ModalBody>
            Are you sure you want to delete <strong>{deleteTarget.name}</strong> in
            namespace <strong>{deleteTarget.namespace}</strong>? This will remove
            the pod, PVC, and all associated data.
          </ModalBody>
          <ModalFooter>
            <Button variant="danger" onClick={handleDelete} isLoading={deleting} isDisabled={deleting}>
              Delete
            </Button>
            <Button variant="link" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          </ModalFooter>
        </Modal>
      )}
    </PageSection>
  );
};

export default HermesDeployerPage;
