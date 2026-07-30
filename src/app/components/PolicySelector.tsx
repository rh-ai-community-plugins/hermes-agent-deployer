import React, { useState, useEffect } from 'react';
import {
  FormGroup,
  FormSelect,
  FormSelectOption,
  FormHelperText,
  HelperText,
  HelperTextItem,
} from '@patternfly/react-core';

interface PolicyTemplate {
  tier: string;
  displayName: string;
  description: string;
}

interface PolicySelectorProps {
  value: string;
  onChange: (tier: string) => void;
}

const PolicySelector: React.FC<PolicySelectorProps> = ({ value, onChange }) => {
  const [templates, setTemplates] = useState<PolicyTemplate[]>([]);

  useEffect(() => {
    fetch('/hermes-agent-deployer/api/policies/templates')
      .then((res) => (res.ok ? res.json() : { templates: [] }))
      .then((data: { templates: PolicyTemplate[] }) => setTemplates(data.templates))
      .catch(() => setTemplates([]));
  }, []);

  const selected = templates.find((t) => t.tier === value);

  return (
    <FormGroup label="Network policy" fieldId="network-policy-tier">
      <FormSelect
        id="network-policy-tier"
        value={value}
        onChange={(_e, val) => onChange(val)}
      >
        {templates.map((t) => (
          <FormSelectOption key={t.tier} value={t.tier} label={t.displayName} />
        ))}
      </FormSelect>
      {selected && (
        <FormHelperText>
          <HelperText>
            <HelperTextItem>{selected.description}</HelperTextItem>
          </HelperText>
        </FormHelperText>
      )}
    </FormGroup>
  );
};

export default PolicySelector;
