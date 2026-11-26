import '@fontsource-variable/big-shoulders';
import '@fontsource-variable/hanken-grotesk';
import '../styles.css';
import './specimen.css';
import { render } from 'preact';
import { startInputMode } from '../input-mode';
import { startTheme } from '../theme';
import { Specimen } from './Specimen';

startTheme();
startInputMode();

document.addEventListener('touchstart', () => {}, { passive: true });

render(<Specimen />, document.getElementById('app')!);
