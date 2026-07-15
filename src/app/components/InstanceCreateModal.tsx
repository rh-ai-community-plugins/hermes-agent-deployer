import React, { useState, useEffect } from 'react';
import {
  Modal,
  ModalVariant,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Form,
  FormGroup,
  TextInput,
  FormSelect,
  FormSelectOption,
  Switch,
  Alert,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';
import { CreateInstanceRequest, AgentType } from '../types';
import { listAgentTypes } from '../api/instanceApi';
import { useNamespaces } from '../hooks/useNamespaces';
import { useInstanceDefaults } from '../hooks/useInstanceDefaults';

interface InstanceCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (req: CreateInstanceRequest) => Promise<void>;
  selectedProject?: string | null;
}

const InstanceCreateModal: React.FC<InstanceCreateModalProps> = ({ isOpen, onClose, onSubmit, selectedProject }) => {
  const { namespaces } = useNamespaces();
  const { defaults } = useInstanceDefaults();
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState(selectedProject ?? '');
  const [agentType, setAgentType] = useState('hermes');
  const [modelName, setModelName] = useState('');
  const [modelUrl, setModelUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [pvcSize, setPvcSize] = useState('1Gi');
  const [oauthProxyEnabled, setOauthProxyEnabled] = useState(true);
  const [agentTypes, setAgentTypes] = useState<AgentType[]>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      listAgentTypes().then(setAgentTypes).catch(() => setAgentTypes([]));
      if (defaults) {
        setPvcSize(defaults.pvc.size);
        setOauthProxyEnabled(defaults.oauthProxy.enabled);
      }
      if (selectedProject) {
        setNamespace(selectedProject);
      }
    }
  }, [isOpen, defaults, selectedProject]);

  const resetForm = () => {
    setName('');
    setNamespace('');
    setAgentType('hermes');
    setModelName('');
    setModelUrl('');
    setApiKey('');
    setPvcSize(defaults?.pvc.size ?? '1Gi');
    setOauthProxyEnabled(defaults?.oauthProxy.enabled ?? true);
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name || !namespace || !modelName || !modelUrl || !apiKey) {
      setError('All fields are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        name,
        namespace,
        agentType,
        modelName,
        modelUrl,
        apiKey,
        pvcSize,
        oauthProxyEnabled,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create instance');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal variant={ModalVariant.medium} isOpen={isOpen} onClose={handleClose}>
      <ModalHeader title="Deploy New Agent Instance" />
      <ModalBody>
        {error && <Alert variant="danger" title={error} isInline style={{ marginBottom: 16 }} />}
        <Form>
          <FormGroup label="Instance name" isRequired fieldId="instance-name">
            <TextInput
              id="instance-name"
              value={name}
              onChange={(_e, val) => setName(val)}
              placeholder="my-hermes-instance"
            />
            <FormHelperText>
              <HelperText>
                <HelperTextItem>Lowercase, alphanumeric and hyphens only</HelperTextItem>
              </HelperText>
            </FormHelperText>
          </FormGroup>

          <FormGroup label="Namespace" isRequired fieldId="namespace">
            <FormSelect id="namespace" value={namespace} onChange={(_e, val) => setNamespace(val)}>
              <FormSelectOption key="" value="" label="Select a namespace..." isPlaceholder />
              {namespaces.map((ns) => (
                <FormSelectOption key={ns} value={ns} label={ns} />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup label="Agent type" isRequired fieldId="agent-type">
            <FormSelect id="agent-type" value={agentType} onChange={(_e, val) => setAgentType(val)}>
              {agentTypes.map((at) => (
                <FormSelectOption key={at.name} value={at.name} label={at.displayName} />
              ))}
            </FormSelect>
          </FormGroup>

          <FormGroup label="Model name" isRequired fieldId="model-name">
            <TextInput
              id="model-name"
              value={modelName}
              onChange={(_e, val) => setModelName(val)}
              placeholder="hermes-3-llama-3.1-8b"
            />
          </FormGroup>

          <FormGroup label="Model API URL" isRequired fieldId="model-url">
            <TextInput
              id="model-url"
              value={modelUrl}
              onChange={(_e, val) => setModelUrl(val)}
              placeholder="https://vllm-route.apps.cluster.local/v1"
            />
          </FormGroup>

          <FormGroup label="API key" isRequired fieldId="api-key">
            <TextInput
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(_e, val) => setApiKey(val)}
            />
          </FormGroup>

          <FormGroup label="PVC size" fieldId="pvc-size">
            <TextInput
              id="pvc-size"
              value={pvcSize}
              onChange={(_e, val) => setPvcSize(val)}
            />
          </FormGroup>

          <FormGroup fieldId="oauth-proxy">
            <Switch
              id="oauth-proxy"
              label="Enable OpenShift OAuth Proxy"
              isChecked={oauthProxyEnabled}
              onChange={(_e, val) => setOauthProxyEnabled(val)}
            />
          </FormGroup>
        </Form>
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={handleSubmit} isLoading={submitting} isDisabled={submitting}>
          Deploy
        </Button>
        <Button variant="link" onClick={handleClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default InstanceCreateModal;
