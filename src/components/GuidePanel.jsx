import { ArrowRight, Check, Compass, Keyboard } from 'lucide-react';

export default function GuidePanel({ dataset, pending, edits, coordination, exported, onExample, navigate }) {
  const hasNextAction = Object.keys(coordination.assignments).length > 0;
  const steps = [
    {
      title: 'Open a list',
      detail: 'Start with twelve fictional participants. The example opens directly in Needs attention, ready to explore. You can bring your own file afterward.',
      view: dataset ? 'queue' : 'intake', complete: Boolean(dataset), action: dataset ? 'See the open list' : 'Go to Start',
    },
    {
      title: 'Understand one question',
      detail: 'In the example, find Dana Vale. A repeated ID and an unclear date need confirmation. Open the card to see the recorded values and why they need attention.',
      view: 'queue', complete: hasNextAction || edits.length > 0, action: 'See what needs attention',
    },
    {
      title: 'Choose who takes the next step',
      detail: 'Give the question an owner and a specific action. For Dana, try “Intake coordinator” and “Confirm the source ID and intended start date,” then choose Waiting. This saves responsibility without sending a message.',
      view: 'queue', complete: hasNextAction, action: 'Add an owner and next action',
    },
    {
      title: 'Confirm the changes you mean to make',
      detail: 'Preview formatting suggestions in Needs attention. Stage them, then compare the original and proposed values in What changed. Approve or undo each proposal; the original file stays intact.',
      view: 'review', complete: edits.length > 0 && pending.length === 0, action: 'See what changed',
    },
    {
      title: 'Prepare the handoff',
      detail: 'Download a readable handoff for the next person. The complete ZIP also includes the original, reviewed records, unresolved questions, decisions, next actions, and a session backup.',
      view: 'export', complete: exported, action: 'Prepare handoff',
    },
  ];
  return <>
    <section className="ir-panel ir-tool-panel ir-guide-start">
      <Compass size={30}/>
      <h2>A useful handoff in five steps.</h2>
      <p>Relay Station helps you see what needs attention, record a decision, and make the next step clear. Try the fictional example to see the whole process.</p>
      <button className="ir-button primary" onClick={onExample}>{dataset ? 'Open the fictional example' : 'Start guided example'}<ArrowRight size={16}/></button>
      {dataset && <p className="ir-form-note">Save a session backup if you want to keep your current work before replacing it with the example.</p>}
    </section>
    <ol className="ir-guide-steps">
      {steps.map((step, index) => <li key={step.title}>
        <span className={'ir-guide-number ' + (step.complete ? 'complete' : '')}>{step.complete ? <Check size={20}/> : index + 1}</span>
        <div><h3>{step.title}</h3><p>{step.detail}</p><button className="ir-text-button" disabled={!dataset && index > 0} onClick={() => navigate(step.view)}>{step.action}<ArrowRight size={14}/></button></div>
      </li>)}
    </ol>
    <section className="ir-panel ir-tool-panel">
      <h2><Keyboard size={23}/> Make it comfortable.</h2>
      <p>Use Readable for larger text and Focus to give the workspace more room. All main actions work with a keyboard.</p>
      <dl className="ir-shortcuts">
        <div><dt><kbd>/</kbd></dt><dd>Focus record search while Needs attention is open.</dd></div>
        <div><dt><kbd>Alt</kbd> + <kbd>1–4</kbd></dt><dd>Move between Start, Needs attention, What changed, and Handoff.</dd></div>
        <div><dt><kbd>Alt</kbd> + <kbd>5</kbd></dt><dd>Open Activity to see the recorded actions.</dd></div>
        <div><dt><kbd>Esc</kbd></dt><dd>Close a record dialog.</dd></div>
        <div><dt><kbd>Tab</kbd></dt><dd>Move through controls, with visible keyboard focus.</dd></div>
      </dl>
      <p>Advanced tools contains reusable review rules, version comparison, optional AI assistance, and local saved workspaces. You can finish the core workflow without setting these up.</p>
    </section>
  </>;
}
