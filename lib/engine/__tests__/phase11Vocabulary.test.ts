import {describe,expect,it} from 'vitest';
import {applyPersonalVocabulary,resolvePersonalTerm} from '../vocabulary';

describe('Phase 11 — personal vocabulary',()=>{
 const entries=[
  {canonical:'Sika White MS',aliases:['sika white'],kind:'product' as const},
  {canonical:'Jason',aliases:['Jayson','Jasen'],kind:'person' as const},
  {canonical:'Pukekohe',aliases:['pukekohoe'],kind:'location' as const},
 ];
 it('resolves exact and learned aliases',()=>{
  expect(resolvePersonalTerm('Jason',entries)?.canonical).toBe('Jason');
  expect(resolvePersonalTerm('Jayson',entries)?.canonical).toBe('Jason');
 });
 it('canonicalises established speech aliases in a sentence',()=>{
  const r=applyPersonalVocabulary('I need to call Jayson about Sika White and go to Pukekohoe',entries);
  expect(r.text).toBe('I need to call Jason about Sika White MS and go to Pukekohe');
  expect(r.matches).toHaveLength(3);
 });
 it('rejects ambiguous fuzzy matches',()=>{
  expect(resolvePersonalTerm('Jadon',[
   {canonical:'Jason',aliases:[],kind:'person' as const},
   {canonical:'Jaden',aliases:[],kind:'person' as const},
  ])).toBeNull();
 });
 it('handles deterministic phonetic variants',()=>{
  expect(resolvePersonalTerm('fone',[{canonical:'phone',aliases:[],kind:'custom' as const}])?.canonical).toBe('phone');
 });
 it('does not rewrite arbitrary prose',()=>{
  expect(applyPersonalVocabulary('I need to check the flashing',entries).matches).toHaveLength(0);
 });
});