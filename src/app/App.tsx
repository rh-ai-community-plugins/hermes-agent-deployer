import React, { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Bullseye, Page, PageSection } from '@patternfly/react-core';
import HermesDeployerPage from './components/HermesDeployerPage';

const App: React.FC = () => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  if (!isReady) {
    return (
      <Page>
        <PageSection>
          <Bullseye>Loading...</Bullseye>
        </PageSection>
      </Page>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HermesDeployerPage />} />
      <Route path="/hermes-agent-deployer" element={<HermesDeployerPage />} />
    </Routes>
  );
};

export default App;
