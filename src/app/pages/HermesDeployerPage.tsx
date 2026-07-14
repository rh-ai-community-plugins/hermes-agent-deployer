import React, { useState } from 'react';
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
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from '@patternfly/react-core';
import { SyncIcon } from '@patternfly/react-icons';
import { HermesInstance, CreateInstanceRequest } from '../types';
import { useInstances } from '../hooks/useInstances';
import { useInstanceMutation } from '../hooks/useInstanceMutation';
import InstanceList from '../components/InstanceList';
import InstanceCreateModal from '../components/InstanceCreateModal';

const HermesDeployerPage: React.FC = () => {
  const { instances, loading, error: listError, refresh } = useInstances();
  const { createInstance, deleteInstance, deleting, error: mutationError } = useInstanceMutation();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HermesInstance | null>(null);

  const error = listError || mutationError;

  const handleCreate = async (req: CreateInstanceRequest) => {
    await createInstance(req);
    refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteInstance(deleteTarget.name, deleteTarget.namespace);
    setDeleteTarget(null);
    refresh();
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
        <InstanceList
          instances={instances}
          onDelete={setDeleteTarget}
          onDeploy={() => setCreateModalOpen(true)}
          loading={loading}
        />
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
