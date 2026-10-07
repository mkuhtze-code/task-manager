import { describe, expect, it } from 'vitest';
import { applyUtteranceToRequest, emptyRequest, requestTaskText } from '../request';
import { runEngineCycle } from '../orchestrate';
import { emptyWorkingMemory } from '../workingMemory';

type Case = [string,string,'create_task'|'pickup'|'remind',string|null,string];

const cases: Case[] = [
  [
    "call",
    "I need to call Jordan to get the measurements for the downpipes for Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "call",
    "Call Sarah to confirm the flashing details for 12 Queen Street.",
    "create_task",
    "12 Queen Street",
    "call sarah"
  ],
  [
    "call",
    "Ring Mike about the gutter measurements at Smith Road.",
    "create_task",
    "Smith Road",
    "ring mike"
  ],
  [
    "call",
    "Phone Dave to ask about the quote for Henderson Road.",
    "create_task",
    "Henderson Road",
    "phone dave"
  ],
  [
    "call",
    "I need to contact John to check whether the leak can be fixed at 8 King Street.",
    "create_task",
    "8 King Street",
    "contact john"
  ],
  [
    "call",
    "Chase Steve for the roofing quote for 4 Park Avenue.",
    "create_task",
    "4 Park Avenue",
    "chase steve"
  ],
  [
    "email",
    "Email Jordan to get the supplier quote for Angela Place.",
    "create_task",
    "Angela Place",
    "email jordan"
  ],
  [
    "email",
    "I need to email Sarah about the flashing at 20 Queen Road.",
    "create_task",
    "20 Queen Road",
    "email sarah"
  ],
  [
    "email",
    "Send Mike an email to confirm the measurements for Smith Street.",
    "create_task",
    "Smith Street",
    "send mike"
  ],
  [
    "email",
    "Write to Dave to ask whether the materials have arrived at 7 King Road.",
    "create_task",
    "7 King Road",
    "write to dave"
  ],
  [
    "text",
    "Text Jordan to get the delivery time for 4 Park Road.",
    "create_task",
    "4 Park Road",
    "text jordan"
  ],
  [
    "text",
    "Message Sarah about the quote for Angela Place.",
    "create_task",
    "Angela Place",
    "message sarah"
  ],
  [
    "ask",
    "Ask Mike to check the flashing for 12 Queen Street.",
    "create_task",
    "12 Queen Street",
    "ask mike"
  ],
  [
    "ask",
    "I need to ask Dave whether the downpipes fit at Henderson Road.",
    "create_task",
    "Henderson Road",
    "ask dave"
  ],
  [
    "check",
    "Check with Jordan to confirm the gutter size for 8 King Street.",
    "create_task",
    "8 King Street",
    "check jordan"
  ],
  [
    "check",
    "I need to check with Sarah about the roof measurements at Smith Road.",
    "create_task",
    "Smith Road",
    "check sarah"
  ],
  [
    "confirm",
    "Confirm with Mike whether the quote is correct for Angela Place.",
    "create_task",
    "Angela Place",
    "confirm mike"
  ],
  [
    "call",
    "Call Jordan to pick up the measurements from the supplier for Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "call",
    "Call Jordan to buy the flashing for Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "email",
    "Email Jordan to order the materials for 12 Queen Street.",
    "create_task",
    "12 Queen Street",
    "email jordan"
  ],
  [
    "get",
    "I need to get the measurements for the downpipes for Angela Place.",
    "create_task",
    "Angela Place",
    "get"
  ],
  [
    "get",
    "Get the supplier quote for 12 Queen Street.",
    "create_task",
    "12 Queen Street",
    "get"
  ],
  [
    "get",
    "I need to get the flashing dimensions from Jordan at Smith Road.",
    "create_task",
    "Smith Road",
    "get"
  ],
  [
    "check",
    "Check the measurements for Angela Place.",
    "create_task",
    "Angela Place",
    "check"
  ],
  [
    "inspect",
    "Inspect the flashing at 12 Queen Street.",
    "create_task",
    "12 Queen Street",
    "inspect"
  ],
  [
    "measure",
    "Measure the roof at Smith Road.",
    "create_task",
    "Smith Road",
    "measure"
  ],
  [
    "fix",
    "Fix the leak at 8 King Street.",
    "create_task",
    "8 King Street",
    "fix"
  ],
  [
    "repair",
    "Repair the gutter at Henderson Road.",
    "create_task",
    "Henderson Road",
    "repair"
  ],
  [
    "install",
    "Install the downpipes at Angela Place.",
    "create_task",
    "Angela Place",
    "install"
  ],
  [
    "replace",
    "Replace the flashing at 20 Queen Road.",
    "create_task",
    "20 Queen Road",
    "replace"
  ],
  [
    "pickup",
    "Pick up the measurements from Jordan at Angela Place.",
    "pickup",
    "Angela Place",
    "pick up"
  ],
  [
    "pickup",
    "I need to pick up the flashing from Bunnings.",
    "pickup",
    "Bunnings",
    "pick up"
  ],
  [
    "pickup",
    "Grab the screws from Mitre 10.",
    "pickup",
    "Mitre 10",
    "pick up"
  ],
  [
    "pickup",
    "Collect the materials from the supplier at 12 Queen Street.",
    "pickup",
    "12 Queen Street",
    "pick up"
  ],
  [
    "pickup",
    "Fetch the signed paperwork from the office.",
    "pickup",
    "the office",
    "pick up"
  ],
  [
    "pickup",
    "Pick up two cartridges of sealant from Bunnings.",
    "pickup",
    "Bunnings",
    "pick up"
  ],
  [
    "pickup",
    "Grab 4 tubes of white MS from Bunnings.",
    "pickup",
    "Bunnings",
    "pick up"
  ],
  [
    "pickup",
    "Collect the clips from 8 King Road.",
    "pickup",
    "8 King Road",
    "pick up"
  ],
  [
    "pickup",
    "Get the parts from the supplier.",
    "pickup",
    "the supplier",
    "pick up"
  ],
  [
    "pickup",
    "I need to go to Bunnings to grab 2 cartridges of clear Sika MS and 2 sausages of Sika White MS.",
    "pickup",
    "Bunnings",
    "pick up"
  ],
  [
    "pickup",
    "Go to Mitre 10 to pick up the screws for Angela Place.",
    "pickup",
    "Mitre 10",
    "pick up"
  ],
  [
    "pickup",
    "Head to Bunnings and grab the flashing.",
    "pickup",
    "Bunnings",
    "pick up"
  ],
  [
    "pickup",
    "Drive to the supplier to collect the brackets.",
    "pickup",
    "the supplier",
    "pick up"
  ],
  [
    "pickup",
    "Go to the office to fetch the signed plans.",
    "pickup",
    "the office",
    "pick up"
  ],
  [
    "dropoff",
    "Drop off clips to 64 Grace James Road in Pukekohe at 4pm today.",
    "create_task",
    "64 Grace James Road in Pukekohe",
    "drop off"
  ],
  [
    "dropoff",
    "I need to drop off the keys at Angela Place tomorrow.",
    "create_task",
    "Angela Place",
    "drop off"
  ],
  [
    "dropoff",
    "Deliver the paperwork to 12 Queen Street.",
    "create_task",
    "12 Queen Street",
    "deliver"
  ],
  [
    "dropoff",
    "Take the materials to Smith Road on Monday.",
    "create_task",
    "Smith Road",
    "take"
  ],
  [
    "dropoff",
    "Leave the samples at 8 King Street.",
    "create_task",
    "8 King Street",
    "leave"
  ],
  [
    "dropoff",
    "Drop off the clips at 64 Grace James Road at 12pm today.",
    "create_task",
    "64 Grace James Road",
    "drop off"
  ],
  [
    "dropoff",
    "Deliver the signed quote to Henderson Road at 3pm.",
    "create_task",
    "Henderson Road",
    "deliver"
  ],
  [
    "dropoff",
    "Take the keys to Angela Place at 10am tomorrow.",
    "create_task",
    "Angela Place",
    "take"
  ],
  [
    "movement",
    "I need to go to Bunnings to buy sealant.",
    "create_task",
    "Bunnings",
    "go"
  ],
  [
    "movement",
    "Head to Mitre 10 to buy screws.",
    "create_task",
    "Mitre 10",
    "head"
  ],
  [
    "movement",
    "Drive to the supplier to collect the brackets.",
    "pickup",
    "the supplier",
    "pick up"
  ],
  [
    "movement",
    "Go to Angela Place to inspect the flashing.",
    "create_task",
    "Angela Place",
    "go"
  ],
  [
    "movement",
    "Drive to Smith Road to measure the roof.",
    "create_task",
    "Smith Road",
    "drive"
  ],
  [
    "movement",
    "I need to go to 12 Queen Street to check the leak.",
    "create_task",
    "12 Queen Street",
    "go"
  ],
  [
    "movement",
    "Head over to Henderson Road to look at the gutter.",
    "create_task",
    "Henderson Road",
    "head"
  ],
  [
    "movement",
    "Travel to Angela Place for the site meeting.",
    "create_task",
    "Angela Place",
    "travel"
  ],
  [
    "location",
    "I need to call Jordan for the quote at Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "location",
    "Email Sarah for the measurements at 12 Queen Road.",
    "create_task",
    "12 Queen Road",
    "email sarah"
  ],
  [
    "location",
    "Ask Mike about the leak at Smith Road.",
    "create_task",
    "Smith Road",
    "ask mike"
  ],
  [
    "location",
    "Check with Dave about the flashing at 8 King Street.",
    "create_task",
    "8 King Street",
    "check dave"
  ],
  [
    "location",
    "Get the quote for Angela Place.",
    "create_task",
    "Angela Place",
    "get"
  ],
  [
    "location",
    "Review the plans for 12 Queen Street.",
    "create_task",
    "12 Queen Street",
    "review"
  ],
  [
    "location",
    "Confirm the delivery for Smith Road.",
    "create_task",
    "Smith Road",
    "confirm"
  ],
  [
    "location",
    "Fix the leak for 8 King Street.",
    "create_task",
    "8 King Street",
    "fix"
  ],
  [
    "location",
    "Measure the roof for Henderson Road.",
    "create_task",
    "Henderson Road",
    "measure"
  ],
  [
    "location",
    "Install the guttering for Angela Place.",
    "create_task",
    "Angela Place",
    "install"
  ],
  [
    "nested",
    "Call Jordan to get the quote for the flashing for Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "nested",
    "Call Jordan to check the measurements for the downpipes for Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "nested",
    "Call Jordan to confirm the supplier can deliver to 12 Queen Street.",
    "create_task",
    "12 Queen Street",
    "call jordan"
  ],
  [
    "nested",
    "Email Sarah to ask Mike about the quote for Smith Road.",
    "create_task",
    "Smith Road",
    "email sarah"
  ],
  [
    "nested",
    "Text Jordan to check whether the materials fit at Angela Place.",
    "create_task",
    "Angela Place",
    "text jordan"
  ],
  [
    "nested",
    "Ask Sarah to get the measurements from Mike for 8 King Road.",
    "create_task",
    "8 King Road",
    "ask sarah"
  ],
  [
    "nested",
    "Contact Dave to arrange the delivery for Henderson Road.",
    "create_task",
    "Henderson Road",
    "contact dave"
  ],
  [
    "nested",
    "Ring Mike to find out the price for Angela Place.",
    "create_task",
    "Angela Place",
    "ring mike"
  ],
  [
    "nested",
    "Phone Sarah to see if the flashing can be repaired at Smith Road.",
    "create_task",
    "Smith Road",
    "phone sarah"
  ],
  [
    "nested",
    "Email Jordan to get a revised quote for 12 Queen Street.",
    "create_task",
    "12 Queen Street",
    "email jordan"
  ],
  [
    "nested",
    "Call the supplier to confirm the order for Angela Place.",
    "create_task",
    "Angela Place",
    "call the supplier"
  ],
  [
    "nested",
    "Call the client to ask about the leak at 8 King Street.",
    "create_task",
    "8 King Street",
    "call the client"
  ],
  [
    "messy",
    "I need to, um, call Jordan and get the measurements for Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "messy",
    "I need to call Jordan — actually, to get the downpipe measurements for Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "messy",
    "Can you remind me to call Jordan about the flashing at Angela Place?",
    "remind",
    "Angela Place",
    "call jordan"
  ],
  [
    "messy",
    "I need to call Jordan tomorrow to confirm the quote for Smith Road.",
    "create_task",
    "Smith Road",
    "call jordan"
  ],
  [
    "messy",
    "Please call Jordan about the measurements for 12 Queen Street today.",
    "create_task",
    "12 Queen Street",
    "call jordan"
  ],
  [
    "time",
    "Call Jordan at 4pm today about Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "time",
    "Email Sarah tomorrow about the quote for Smith Road.",
    "create_task",
    "Smith Road",
    "email sarah"
  ],
  [
    "time",
    "Pick up the materials from Bunnings at 2pm today.",
    "pickup",
    "Bunnings",
    "pick up"
  ],
  [
    "time",
    "Drop off the clips at Angela Place at 4:30pm tomorrow.",
    "create_task",
    "Angela Place",
    "drop off"
  ],
  [
    "time",
    "Check the flashing at 12 Queen Street on Monday.",
    "create_task",
    "12 Queen Street",
    "check"
  ],
  [
    "time",
    "Call Jordan after the meeting about Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "correction",
    "I need to call Jordan to get the measurements for the downpipes for Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "correction",
    "Actually call Jordan to get the measurements for Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "materials",
    "I need to buy 2 cartridges of clear Sika MS and 2 sausages of Sika White MS from Bunnings.",
    "create_task",
    "Bunnings",
    "buy"
  ],
  [
    "materials",
    "Buy 4 tubes of white MS at Bunnings.",
    "create_task",
    "Bunnings",
    "buy"
  ],
  [
    "materials",
    "Order 10 downpipe clips for Angela Place.",
    "create_task",
    "Angela Place",
    "order"
  ],
  [
    "materials",
    "Purchase flashing for 12 Queen Street.",
    "create_task",
    "12 Queen Street",
    "purchase"
  ],
  [
    "materials",
    "Get 6 lengths of gutter from the supplier for Smith Road.",
    "create_task",
    "the supplier",
    "get"
  ],
  [
    "purpose",
    "I need to call Jordan because I need the downpipe measurements for Angela Place.",
    "create_task",
    "Angela Place",
    "call jordan"
  ],
  [
    "purpose",
    "I need to email Sarah because the quote for Smith Road is wrong.",
    "create_task",
    "Smith Road",
    "email sarah"
  ],
  [
    "purpose",
    "I need to ask Mike whether the flashing can be repaired at 8 King Street.",
    "create_task",
    "8 King Street",
    "ask mike"
  ],
  [
    "purpose",
    "I need to check with Dave whether the materials arrived at Angela Place.",
    "create_task",
    "Angela Place",
    "check dave"
  ],
  [
    "purpose",
    "I need to ring Jordan about whether the supplier can deliver to 12 Queen Street.",
    "create_task",
    "12 Queen Street",
    "ring jordan"
  ],
  [
    "no location",
    "Call Jordan to get the measurements for the downpipes.",
    "create_task",
    null,
    "call jordan"
  ],
  [
    "no location",
    "Email Sarah about the quote.",
    "create_task",
    null,
    "email sarah"
  ],
  [
    "no location",
    "Pick up the materials from Bunnings.",
    "pickup",
    "Bunnings",
    "pick up"
  ],
  [
    "no location",
    "Check the flashing.",
    "create_task",
    null,
    "check"
  ],
  [
    "no location",
    "Fix the leak.",
    "create_task",
    null,
    "fix"
  ],
  [
    "no location",
    "Measure the roof.",
    "create_task",
    null,
    "measure"
  ]
];

describe('capture torture suite — 100 natural language cases', () => {
  it.each(cases)('%s — %s', (category, input, expectedAction, expectedLocation, expectedTitle) => {
    const req = applyUtteranceToRequest(null, input, emptyWorkingMemory());
    const rendered = requestTaskText(req).toLowerCase();

    expect(req.action, input).toBe(expectedAction);
    if (expectedLocation) {
      expect(req.locationText, input).toBe(expectedLocation);
    }
    expect(rendered, input).toContain(expectedTitle.toLowerCase());

    if (expectedAction !== 'pickup') {
      expect(rendered, input).not.toMatch(/^pick up\b/);
    }
  });

  it('compound calls never become physical pickup', () => {
    for (const [, input, expectedAction] of cases) {
      if (!/\b(?:call|ring|phone|email|text|message|contact|ask|confirm|check)\b/i.test(input)) continue;
      const req = applyUtteranceToRequest(null, input, emptyWorkingMemory());
      expect(req.action, input).not.toBe('pickup');
      expect(requestTaskText(req).toLowerCase(), input).not.toMatch(/^pick up\b/);
    }
  });

  it('explicitly scheduled captures remain executable', () => {
    for (const [, input] of cases) {
      if (!/\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i.test(input)) continue;
      const result = runEngineCycle({
        utterance: input,
        workingMemory: emptyWorkingMemory(),
        todayDate: '2026-10-08',
        context: { jobs: [], meetings: [] },
      });
      expect(result.authority.mayAct, input).toBe(true);
      expect(result.action.kind, input).not.toBe('ask');
    }
  });
});
