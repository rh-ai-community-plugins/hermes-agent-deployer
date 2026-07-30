import React, { useState, useMemo, useCallback } from 'react';
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
import { ProjectSelector } from '../components/ProjectSelector';

const LAST_PROJECT_KEY = 'hermes-deployer.last-project';

function readLastProject(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

function writeLastProject(project: string | null): void {
  try {
    if (project) {
      localStorage.setItem(LAST_PROJECT_KEY, project);
    } else {
      localStorage.removeItem(LAST_PROJECT_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

const HermesDeployerPage: React.FC = () => {
  const { instances, loading, error: listError, refresh } = useInstances();
  const { createInstance, deleteInstance, suspendInstance, resumeInstance, deleting, error: mutationError } = useInstanceMutation();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HermesInstance | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(readLastProject);

  const error = listError || mutationError;

  const handleProjectSelect = useCallback((project: string | null) => {
    setSelectedProject(project);
    writeLastProject(project);
  }, []);

  const filteredInstances = useMemo(() => {
    if (!selectedProject) return instances;
    return instances.filter((i) => i.namespace === selectedProject);
  }, [instances, selectedProject]);

  const handleCreate = async (req: CreateInstanceRequest) => {
    await createInstance(req);
    refresh();
  };

  const handleStop = async (inst: HermesInstance) => {
    await suspendInstance(inst.name, inst.namespace);
    refresh();
  };

  const handleStart = async (inst: HermesInstance) => {
    await resumeInstance(inst.name, inst.namespace);
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

      <div style={{ marginBottom: 16 }}>
        <ProjectSelector
          selectedProject={selectedProject}
          onSelect={handleProjectSelect}
        />
      </div>

      {error && <Alert variant="danger" title={error} isInline style={{ marginBottom: 16 }} />}

      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Button variant="primary" onClick={() => setCreateModalOpen(true)} isDisabled={!selectedProject}>
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

      {!selectedProject ? (
        <Bullseye style={{ minHeight: 200 }}>
          <div style={{ textAlign: 'center' }}>
            <Title headingLevel="h3">Select a project</Title>
            <p>Choose a project above to view and manage Hermes Agent instances.</p>
          </div>
        </Bullseye>
      ) : loading ? (
        <Bullseye><Spinner /></Bullseye>
      ) : (
        <InstanceList
          instances={filteredInstances}
          onDelete={setDeleteTarget}
          onStop={handleStop}
          onStart={handleStart}
          onDeploy={() => setCreateModalOpen(true)}
          loading={loading}
        />
      )}

      <InstanceCreateModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={handleCreate}
        selectedProject={selectedProject}
      />

      {deleteTarget && (
        <Modal variant={ModalVariant.small} isOpen onClose={() => setDeleteTarget(null)}>
          <ModalHeader title="Delete Instance" />
          <ModalBody>
            Are you sure you want to delete <strong>{deleteTarget.name}</strong> in
            namespace <strong>{deleteTarget.namespace}</strong>? This will remove
            the sandbox, storage, and all associated data.
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
