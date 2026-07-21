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
import { listNamespaces, listAgentTypes } from '../api/instanceApi';
import { getInstanceDefaults, InstanceDefaults } from '../api/config';

const K8S_NAME_REGEX = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
const MAX_NAME_LENGTH = 63;
const MAX_API_KEY_LENGTH = 1000;

interface InstanceCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (req: CreateInstanceRequest) => Promise<void>;
}

const InstanceCreateModal: React.FC<InstanceCreateModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [namespace, setNamespace] = useState('');
  const [agentType, setAgentType] = useState('hermes');
  const [modelName, setModelName] = useState('');
  const [modelUrl, setModelUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyWarning, setApiKeyWarning] = useState('');
  const [pvcSize, setPvcSize] = useState('1Gi');
  const [oauthProxyEnabled, setOauthProxyEnabled] = useState(true);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [agentTypes, setAgentTypes] = useState<AgentType[]>([]);
  const [defaults, setDefaults] = useState<InstanceDefaults | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState('');
  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    if (isOpen) {
      listNamespaces().then(setNamespaces).catch(() => setNamespaces([]));
      listAgentTypes().then(setAgentTypes).catch(() => setAgentTypes([]));
      getInstanceDefaults().then((d) => {
        setDefaults(d);
        setPvcSize(d.pvc.size);
        setOauthProxyEnabled(d.oauthProxy.enabled);
      });
    }
  }, [isOpen]);

  const resetForm = () => {
    setName('');
    setNamespace('');
    setAgentType('hermes');
    setModelName('');
    setModelUrl('');
    setApiKey('');
    setApiKeyWarning('');
    setPvcSize(defaults?.pvc.size ?? '1Gi');
    setOauthProxyEnabled(defaults?.oauthProxy.enabled ?? true);
    setError('');
    setNameError('');
    setUrlError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleNameChange = (_e: React.FormEvent<HTMLInputElement>, val: string) => {
    const trimmed = val.slice(0, MAX_NAME_LENGTH);
    if (trimmed && !K8S_NAME_REGEX.test(trimmed)) {
      setNameError('Must be lowercase alphanumeric or hyphens, max 63 characters');
    } else {
      setNameError('');
    }
    setName(trimmed);
  };

  const handleModelUrlChange = (_e: React.FormEvent<HTMLInputElement>, val: string) => {
    setModelUrl(val);
    if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
      setUrlError('Must start with http:// or https://');
    } else {
      setUrlError('');
    }
  };

  const handleSubmit = async () => {
    if (!name || !namespace || !modelName || !modelUrl || !apiKey) {
      setError('All fields are required.');
      return;
    }
    if (nameError) {
      setError('Invalid instance name. Must be lowercase alphanumeric or hyphens, max 63 characters.');
      return;
    }
    if (urlError) {
      setError('Invalid model URL format.');
      return;
    }
    if (apiKey.length > MAX_API_KEY_LENGTH) {
      setApiKeyWarning('API key may be truncated for security.');
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
              onChange={handleNameChange}
              placeholder="my-hermes-instance"
              validated={nameError ? 'warning' : 'default'}
            />
            <FormHelperText>
              {nameError ? (
                <HelperText>
                  <HelperTextItem variant="warning">{nameError}</HelperTextItem>
                </HelperText>
              ) : name ? (
                <HelperText>
                  <HelperTextItem>{name.length}/${MAX_NAME_LENGTH} characters</HelperTextItem>
                </HelperText>
              ) : (
                <HelperText>
                  <HelperTextItem>Lowercase, alphanumeric and hyphens only</HelperTextItem>
                </HelperText>
              )}
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
              onChange={handleModelUrlChange}
              placeholder="https://vllm-route.apps.cluster.local/v1"
              validated={urlError ? 'warning' : 'default'}
            />
            {urlError && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="warning">{urlError}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>

          <FormGroup label="API key" isRequired fieldId="api-key">
            <TextInput
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(_e, val) => {
                setApiKey(val.slice(0, MAX_API_KEY_LENGTH));
                if (val.length > MAX_API_KEY_LENGTH) {
                  setApiKeyWarning(`API keys longer than ${MAX_API_KEY_LENGTH} characters will be truncated`);
                } else {
                  setApiKeyWarning('');
                }
              }}
            />
            {apiKeyWarning && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem variant="warning">{apiKeyWarning}</HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
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
