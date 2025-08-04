/**
 * A Venom-like test runner tool reading yaml files to hit an API server
 * Copyright (c) 2023-2024 James Shelby shelby(at)dtsol.com all rights reserved
 */
const axios = require('axios');
const randomatic = require('randomatic');
const req = require('require-yml');
const { globSync } = require('glob');
const { createReadStream } = require('fs');
const { isDeepStrictEqual } = require('util');
const { deepStrictEqual } = require('node:assert/strict');
const { merge, isPlainObject } = require('lodash');
const { Network, JsonRpcProvider, Wallet, Contract, Signature } = require('ethers');
const chrono = require('chrono-node');

// Closure vars; possible update using cmdline?
let verbose = 0;
let apiServerDelayMs = 0; //5000;
let output = console.log;

const trace = (level, name, object, deep = false) => {
  if (level > verbose) return;
  if (deep) {
    output(name, 'deep');
    Object.entries(object).forEach(([k, v]) => output(k, v));
  } else {
    output(name, object);
  }
};

class Ey {
  constructor(vars) {
    const f = 'Ey.constructor:';
    // Hash of vars as they become known i.e. (step) variables: accessTokenInitial: '.response.body.accessToken'
    this.vars = vars; // Initial vars, plus any created vars from suite(s)
    this.varsBySuite = {}; // Suite-based vars captured at end of each suite hashed by suite-name
    this._tools = {
      randAlpha: (len) => randomatic('Aa', len),
      randNumeric: (len) => randomatic('0', len),
      toJSON: (object) => JSON.stringify(object),
      toString: (value) => String(value),
      toLower: (value) => String(value).toLowerCase(),
      encode: (value) => encodeURIComponent(value),
      dump: () => JSON.stringify(this), // i.e. {{.baseUrl | dump}}
    };
  }

  // Find reference to 'segments' in currentContext - i.e. this.currentContext[segments[0]][segments[1]]...
  // Note: a segment like tasks0 could map to current.tasks[0]
  _mapVar(segments) {
    const f = 'Ey._mapVar:';
    let lastSegment = null;
    let current = this.currentContext;
    for (const segment of segments) {
      if (!current || typeof current !== 'object') {
        trace(6, f + 'abort2', { segment, segments, final: undefined });
        return undefined;
      }
      const isArray = Array.isArray(current);
      // TODO NEED A CLEAN DEBUG LINE TO SHOW WHAT COULD BE WRONG IN A VARIABLE REFERENCE
      trace(
        6,
        f + 'segment-in-current',
        {
          segment,
          current__type: typeof current,
          current__keys: isArray ? 'isArray' : Object.keys(current),
          current__segment__type: isArray ? 'isArray' : typeof current[segment],
        },
        true
      );
      if (segment in current) {
        current = current[segment];
      } else if (Array.isArray(current) && segment.slice(lastSegment.length).match(/^[0-9]+$/)) {
        current = current[Number(segment.slice(lastSegment.length))];
      } else {
        trace(6, f + 'abort2', { segment, segments, final: undefined });
        // Name not found. Venom just does not encode it: throw new Error(`Unknown var key: ${segment} (segments=) ${segments.join(".")}`);
        // TODO: ALLOW TO SHOW WARNING AND/OR OPTION TO FAIL?
        return undefined;
      }
      lastSegment = segment;
    }
    trace(4, f + 'done', { segments, final: current });
    return current;
  }

  // Expand the values of the object, returning a new object
  _expand(object) {
    const f = 'Ey._expand:';
    trace(3, f + 'before', { object });
    const newObject = {};
    const find = (key, string) => {
      // Look for {{some-var-string}}
      let finalValue;
      let wasWholeString;
      const newString = string.replace(/{{[^}]+}}/g, (oneMatch) => {
        wasWholeString = string.length === oneMatch.length;
        // Expect e.g. {{ a | b | c | d}} a=number,b=command,c=.var.ref,d=?not-sure
        const params = oneMatch
          .slice(2, -2)
          .split('|')
          .map((param) => param.trim());
        trace(6, f, { params });
        let result = null;
        let abort = false;
        params.forEach((p) => {
          if (abort) return;
          if (p.match(/^[1-9][0-9]*$/)) {
            result = Number(p);
            trace(7, f + 'number', { p, result });
          } else if (this._tools[p]) {
            const lastResult = result;
            result = this._tools[p](lastResult);
            trace(7, f + '_tools', { p, lastResult, result });
          } else if (p[0] !== '.') {
            throw new Error(`${f}  EXPECTED LEADING DOT, NUMBER, or one of tools(${Object.keys(this._tools)}) {{...}} - (${p})`);
          } else {
            const segments = p.split('.'); // i.e. .someVar -> ["","someVar"]
            trace(7, f, { segments });
            result = this._mapVar(segments.slice(1));
            if (result === undefined) {
              abort = true;
              return (result = oneMatch); // Leave untouched/un-expanded
            }
          }
        });
        if (wasWholeString) finalValue = result;
        return result;
      });
      if (!wasWholeString) finalValue = newString;
      if (finalValue !== object[key]) {
        trace(6, f + 'find', { key, finalValue });
      }
      return finalValue;
    };
    for (let key in object) {
      const item = object[key];
      trace(6, f, { key, type: typeof item });
      if (typeof item === 'string') newObject[key] = find(key, item);
      else if (item && Array.isArray(item)) {
        newObject[key] = item.map((item) => {
          if (typeof item === 'string') return find(key, item);
          return this._expand(item); // TODO only works if this is a real object, not another array!!
        });
      } else if (item && !Array.isArray(item) && typeof item === 'object') {
        newObject[key] = this._expand(item);
      } else newObject[key] = item; // No translation
    }
    trace(4, f + 'after', { newObject }, true);

    return newObject;
  }

  progress(type, object, index) {
    const f = 'Ey.progress:';
    trace(4, f, { type, object, index }); // TODO WHEN VERBOSE NEEDED
    switch (type) {
      case 'info':
        output('      ', type, this._expand({ info: object.info }).info);
        break;
      case 'step':
        if (verbose > 0) output('    ', type, index);
        break;
      case 'suiteRange':
        output('  ', type, index, object.name ?? '');
        break;
      case 'stepRange':
        output('    ', type, index, object?.name ?? '');
        break;
      case 'suite':
        output('-', type, object.name ?? '', index);
        break;
      case 'module':
        output('\n', type, object.name ?? '', index, object.vars ? 'vars:' + Object.keys(object.vars) : '');
        break;
      default:
        throw new Error('Unknown progress type: ' + type);
    }
  }

  async module(fileKey, module) {
    this.progress('module', module, fileKey); // TODO SWAP LAST TWO PARAMS?
    this.moduleVars = module.vars ?? {};
    await this.suites(module.testcases);
  }

  async suites(suites) {
    const f = 'Ey.suites:';
    const suiteList = onlySkipArray(suites);
    for (let idx in suiteList) {
      const suite = suiteList[idx];
      this.progress('suite', suite, idx);
      this.stepVarsResultsForSuite = {}; // May be populated by step.vars
      this.suiteVars = suite.vars ?? {};
      this.currentSuite = suite; // Track the current suite
      if (suite.range) {
        // Iterate on each 'range' context
        const suiteRange = onlySkipArray(suite.range);
        for (let rangeIdx in suiteRange) {
          const range = suiteRange[rangeIdx];
          this.progress('suiteRange', range, rangeIdx); // TODO SWAP LAST TWO PARAMS?
          this.rangeVars = range; // Set for later expand
          await this.steps(suite.steps);
        }
      } else {
        // No 'range' so do it flat
        this.rangeVars = {}; // Set for later expand
        await this.steps(suite.steps);
      }
      const suiteIdx = suite.name ? suite.name.toLowerCase().replaceAll(' ', '-') : idx;
      trace(1, f + 'loop:' + idx, { suiteIdx });
      this.varsBySuite[suiteIdx] = { result: this.currentContext.result }; // Snapshot last result by suite-name
      Object.assign(this.varsBySuite[suiteIdx], this.stepVarsResultsForSuite); // Steps that had vars (i.e. step.vars)
      this.currentSuite = null; // Clear the current suite
    }
  }

  async steps(stepListRaw) {
    const f = 'Ey.steps:';
    trace(4, f + 'stepListRaw', stepListRaw, true); // TODO THIS BLOWS UP IF testsuites[x].steps is missing
    const stepList = onlySkipArray(stepListRaw);
    for (let idx in stepList) {
      const step = stepList[idx];
      this.progress('step', step, idx);

      if (step.range) {
        // Iterate on each 'range' context
        const snapSuiteRange = this.rangeVars;
        const stepRange = onlySkipArray(step.range);
        for (let rangeIdx in stepRange) {
          const range = stepRange[rangeIdx];
          this.progress('stepRange', range, rangeIdx); // TODO SWAP LAST TWO PARAMS?
          this.rangeVars = Object.assign({}, snapSuiteRange, range); // Set for later expand
          await this._step(idx, step);
        }
      } else {
        // No 'range'
        await this._step(idx, step);
      }
    }
  }

  // Process:
  //  - expand vars into currentContext and range (into context.value)
  //  - Run executor
  //  - Validate with 'deepequal'
  //  - Capture any output variables for next steps / suites
  async _step(idx, step) {
    const f = 'Ey._step:';
    // Time to create variables-context used by any executor's expand calls and follow-ups (step.vars->suiteVars, info, assertions...)
    // Outer to inner: vars (globals), varsBySuite (don't re-expand), moduleVars, rangeVars (suite+step), suiteVars (suite.vars/step.vars)
    let newVars, newModuleVars, newRangeVars, newSuiteVars;
    // Copy global vars; Expand rangeVars, suiteVars step (inside executor though), and call executor
    this.currentContext = { ...this.vars, ...this.varsBySuite }; // Initially un-expanded
    Object.assign(this.currentContext, (newVars = this._expand(this.vars))); // Expand vars with other vars where needed
    Object.assign(this.currentContext, (newModuleVars = this._expand(this.moduleVars)));
    this.currentContext.value = newRangeVars = this._expand(this.rangeVars);
    Object.assign(this.currentContext, (newSuiteVars = this._expand(this.suiteVars)));

    // Track step index and suite information
    this.currentContext.stepIndex = idx;
    this.currentContext.suite = this.currentSuite;

    // Now expand from inside back to outside
    Object.assign(this.currentContext, this._expand(newSuiteVars));
    Object.assign(this.currentContext.value, this._expand(newRangeVars));
    Object.assign(this.currentContext, this._expand(newModuleVars));
    Object.assign(this.currentContext, this._expand(newVars));

    // TODO USE 'PLUGIN' TYPE I/F TO EXTEND WITH EXECUTORS LIKE HTTP, ETC.
    let result = {};
    if (step.type === 'http') {
      result = await this.http(step);
    } else if (step.type === 'ethers') {
      result = await this.ethers(step);
    } else if (step.type === 'noop') {
    } else throw new Error(`${f} Unknown step.type (${step.type})`);
    this.currentContext.result = result;
    // Now show user's debug (info)
    if (step.info) this.progress('info', step);
    if (step.vars) {
      // Each 'key' has e.g. 'from: result.whatever'
      Object.keys(step.vars).forEach((key) => {
        const spec = step.vars[key]; // TODO HANDLE OTHER THAN 'FROM'??
        const value = this._mapVar(spec.from.split('.')); // Only allow a variable reference here; use step.variables: for global generic string with expansion
        // const value = this._expand({ value: spec.from }).value; // Could be e2e_{{10|randAlpha}}@dtsol
        this.stepVarsResultsForSuite[key] = value;
      });
    }
    this.deepequal(step.deepequal);
    this.assertions(step.assertions);
    if ('variables' in step) {
      this.variables(step.variables);
    }
  }

  // spec: method, url, headers, timeout, body, multipart_form
  // returns: request, response
  async http(step) {
    const f = 'Ey.http:';
    const pickHttp = ({ method, url, headers, timeout, body, multipart_form }) => ({
      method,
      url,
      headers,
      timeout: (timeout ?? 30) * 1000,
      body,
      multipart_form,
    });
    const request = this._expand(pickHttp(step));
    // Handle multipart_form if exists
    let form = null;
    if (request.multipart_form) {
      if (request.body) throw new Error(`${f} Cannot specify multipart_form AND body.`);
      let mf = request.multipart_form;
      if (!Array.isArray(mf)) mf = [mf];
      // Ordered list of form fields (for when field order is important - like with S3 signed URLs)
      const FormData = require('form-data');
      form = new FormData();
      mf.forEach((obj) => {
        Object.keys(obj).forEach((key) => {
          const value = obj[key];
          if (typeof value !== 'string') throw new Error(`${f} Expected string values (key=${key},value=(${value}))`);
          if (value[0] === '@') {
            let filename = value.slice(1).split('/').slice[-1];
            form.append(key, createReadStream(value.slice(1)), { filename });
          } else {
            form.append(key, obj[key]);
          }
        });
      });
      // Implies content-type: multipart/form-data
      const formLength = await new Promise((resolve, reject) => {
        form.getLength((err, length) => {
          if (err) return reject(err);
          resolve(length);
        });
      });
      request.headers = Object.assign(request.headers ?? {}, {
        'content-length': formLength,
        ...form.getHeaders(),
      });
    } else if (Array.isArray(request.body)) {
      // Body as array is an array of objects to be merged
      request.body = request.body.reduce((accumulator, currentValue) => (Object.assign(accumulator, currentValue), accumulator), {});
    } else if (typeof request.body === 'string' && request.body[0] === '@') {
      // Handle @ file reference in body field
      const fs = require('fs');
      request.body = fs.readFileSync(request.body.slice(1));
    }
    const start = Date.now();
    const axiosRequest = { ...request, data: form ?? request.body };
    delete axiosRequest.body;
    delete axiosRequest.multipart_form;
    trace(4, f + 'request', { step, request, axiosRequest }, true);
    const response = await axios(axiosRequest)
      .then((response) => {
        return {
          statuscode: response.status,
          // Convert AxiosHeaders to plain object so isPlainObject check passes in buildObject
          headers: Object.assign({}, response.headers),
          bodyjson: response.data,
        };
      })
      .catch((e) => {
        const response = {
          bodyjson: e.response?.data,
          statuscode: e.response?.status,
          message: e.message,
          stack: e.stack,
        };
        // TODO ALLOW TO INDICATE THIS AND STILL BE ABLE TO RUN NEXT STEP/SUITE/RANGE/MODULE???
        if (e.message.match(/timeout/)) {
          output(f, e.message); // TODO throw new Error(e.message); // JSON.stringify(response));
        }
        return response;
      });
    response.timeseconds = Math.floor((Date.now() - start) / 1000);
    response.body = JSON.stringify(response.bodyjson); // Simulate the raw response before axios parsed it
    trace(3, f + 'request', request);
    trace(3, f + 'response', response, true);
    response.request = request;
    return response;
  }

  // spec: network: {name, id}, provider: {url, network, options}
  // ... wallet: {signer, provider}, contract:{address, abi, signer}
  // TODO returns: request, response
  async ethers(stepRaw) {
    const f = 'Ey.ethers:';
    let network, provider, wallet, contract, domain, message, permit, v, r, s;
    const pick = ({ network, provider, wallet, contract, permit }) => ({ network, provider, wallet, contract, permit });
    const step = this._expand(pick(stepRaw));
    trace(1, f + 'expand', { step });

    // const network = new Network( name, id); (or just 'id')
    if (step.network) {
      if (!step.network.id) throw new Error(`${f} ethers.step.network requires 'network.id'`);
      trace(1, f + 'Network', { network: step.network });
      network = step.network.name ? new Network(step.network.name, step.network.id) : new Network(step.network.id);
    }
    // const provider = new JsonRpcProvider(details.url, network, { staticNetwork: network });
    if (step.provider) {
      if (!network) throw new Error(`${f} Step.provider requires a network`);
      if (!step.provider.url) throw new Error(`${f} Step.provider requires 'provider.url'`);
      trace(1, f + 'JsonRpcProvider', { url: step.provider.url, network });
      provider = new JsonRpcProvider(step.provider.url, network, { staticNetwork: network });
    }
    // const signer = new Wallet(process.env[details.orgSigner], provider);
    if (step.wallet) {
      // TODO CONSIDER THE CASE OF A WALLET WITHOUT A PROVIDER (FOR E.G. OFF CHAIN PERMIT SIGNING??)
      if (!provider) throw new Error(`${f} Step.wallet requires a provider`);
      if (!step.wallet.signer) throw new Error(`${f} Step.wallet requires 'wallet.signer'`);
      trace(1, f + 'Wallet', { signer: step.wallet.signer, provider });
      wallet = new Wallet(step.wallet.signer, provider);
    }
    // const contract = new Contract('0x' + details.ecr2612Address, ECR2612_ABI, signer);
    if (step.contract) {
      if (!wallet) throw new Error(`${f} Step.contract requires a wallet`);
      if (!step.contract.address) throw new Error(`${f} Step.contract requires 'contract.address' of smart contract`);
      if (!step.contract.abi) throw new Error(`${f} Step.contract requires 'contract.abi' array of function signatures`);
      trace(1, f + 'Contract', { address: step.contract.address, abi: step.contract.abi, wallet });
      contract = new Contract(step.contract.address, step.contract.abi, wallet);
    }

    // Advanced topics: Sign typed data to create e.g. permit

    // Sign the permit data using the sender's private key
    if (step.permit) {
      if (!contract) throw new Error(`${f} Step.permit requires a contract`);
      //if (!step.permit.domain) throw new Error(`${f} Step.permit requires 'permit.domain' {version(2),chainId|network}`);
      if (!step.permit.spender) throw new Error(`${f} Step.permit requires 'permit.spender' who receives the permit`);
      if (!step.permit.value && step.permit.value !== 0) throw new Error(`${f} Step.permit requires 'permit.value'`);
      if (!step.permit.deadline) throw new Error(`${f} Step.permit requires 'permit.deadline' (date-ish)`);
      const p = step.permit;
      const d = p.domain;
      domain = {
        name: await contract.name(),
        version: String(d?.version || 2),
        chainId: d?.chainId || network.chainId,
        verifyingContract: await contract.getAddress(),
      };
      const permitTypes = [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ];
      const owner = wallet.address; // TODO COULD GIVE ERROR IF ONE IS NOT PRESENT AND EXPLAIN WHAT IS NEEDED
      message = {
        owner: owner.slice(0),
        spender: p.spender.slice(0),
        value: p.value,
        nonce: await contract.nonces(owner),
        //deadline: Math.floor(new Date(p.deadline).getTime() / 1000),
        deadline: Math.floor(chrono.parseDate(p.deadline).getTime() / 1000),
      };
      trace(1, f + 'Permit(signTypedData)', { domain, permitTypes, message });
      permit = await wallet.signTypedData(domain, { Permit: permitTypes }, message);
      ({ v, r, s } = Signature.from(permit));
    }

    const pickM = ({ owner, spender, value, deadline }) => ({ owner, spender, value, deadline });
    return {
      request: step,
      raw: { network, provider, wallet, contract, domain, message, permit, v, r, s },
      json: { network: network.toJSON(), domain, message, v, r, s, permit: { ...pickM(message), v, r, s } },
    };
  }

  deepequal(spec) {
    const f = 'Ey.deepequal:';
    if (spec == null) return;
    trace(2, f, { spec });
    // Merge with .deepequal[string] and use util.deepequal
    const base = this.currentContext.deepequal ?? {}; // Hash of partials by partial-name
    const finalSpec = {};
    const specArray = Array.isArray(spec) ? spec : [spec];
    specArray.forEach((item) => {
      if (typeof item === 'string') {
        // Pull from base
        if (!(item in base)) throw new Error(`${f} missing key (${item}) in vars:deepequal; pick one of (${Object.keys(base)})`);
        merge(finalSpec, base[item]);
      } else if (item && typeof item === 'object') {
        merge(finalSpec, this._expand(item));
      } else {
        throw new Error(f, 'NOT IMPLEMENTED');
      }
    });
    trace(2, f, { finalSpec });

    const algorithms = {
      len: ($, fail) => (typeof $ === 'string' || Array.isArray($) ? $.length : `${fail}: no length property on type (${typeof $})`),
      lt: (lhs, rhs) => [`lt ${lhs} true`, rhs < lhs ? `lt ${lhs} true` : rhs],
      gt: (lhs, rhs) => [`gt ${lhs} true`, rhs > lhs ? `gt ${lhs} true` : rhs],
      regex: (lhs, rhs) => [lhs, String(rhs).match(new RegExp(lhs)) ? lhs : `No match: ${rhs}`],
    };
    const buildObject = (wanted, have) => {
      const f = 'deepequal.buildObject:';
      // log(0, f, { wanted, have });
      const actual = {};
      const expected = {};
      // Assume 'wanted' is an object of keys, so of which has values that recurse to buildObject
      // TODO HANDLE ARRAYS
      for (let keySpec in wanted) {
        const [key, algo] = keySpec.split('__');
        const valWanted = wanted[keySpec];
        // log(0, f, { keySpec, key, algo, valWanted, ty: typeof valWanted });
        if (isPlainObject(valWanted)) {
          // Recurse if both 'wanted' and 'have' are objects, else leave as is
          const valHave = have[key];
          // log(0, f, { valHave, ty: typeof valHave, truthy: valHave ? true : false });
          if (isPlainObject(valHave)) {
            [expected[key], actual[key]] = buildObject(valWanted, valHave);
          } else {
            // Compare as-is since types don't match
            expected[key] = valWanted;
            actual[key] = valHave;
          }
          continue;
        }
        if (algo === undefined) {
          // No conversion, compare as-is
          expected[key] = valWanted;
          actual[key] = have[key];
        } else if (algo === 'len') {
          // log(0, f + "len", { wanted, have, valWanted, valHave: have[key] });
          // Length only compare (expect string)
          expected[keySpec] = valWanted;
          // log(0, f + "len2", { wanted, have, valWanted, valHave: have[key] });
          actual[keySpec] = algorithms.len(have[key], 'have');
        } else if (algo === 'lt') {
          [expected[keySpec], actual[keySpec]] = algorithms.lt(valWanted, have[key]);
        } else if (algo === 'gt') {
          [expected[keySpec], actual[keySpec]] = algorithms.gt(valWanted, have[key]);
        } else if (algo === 'keys') {
          [expected[keySpec], actual[keySpec]] = [valWanted, Object.keys(have)];
        } else if (algo === 'theseIds' && Array.isArray(have[key]) && Array.isArray(valWanted)) {
          // Organize the wanted array by id in the have array
          const haveById = {};
          have[key].forEach((item) => {
            haveById[item.id] = item;
          });
          [expected[keySpec], actual[keySpec]] = [valWanted, valWanted.map((item) => haveById[item.id])];
        } else if (algo === 'typeof') {
          [expected[keySpec], actual[keySpec]] = [
            valWanted,
            have[key] == null ? String(have[key]) : Array.isArray(have[key]) ? 'array' : typeof have[key],
          ];
        } else if (algo === 'regex') {
          // log(0, f + "len2", { wanted, have, valWanted, valHave: have[key] });
          // Authorization__regex: "^Bearer [0-9a-zA-z.]{60}$"
          [expected[keySpec], actual[keySpec]] = algorithms.regex(valWanted, have[key]);
        } else throw new Error(`${f} + algo (${algo}) NOT IMPLEMENTED`);
      }
      return [actual, expected];
    };
    const [actual, expected] = buildObject(finalSpec, this.currentContext.result);
    const isDeepEqual = isDeepStrictEqual(actual, expected);
    trace(3, f, { isDeepEqual });

    // Show test case and step information
    const testCaseName = this.currentContext.suite?.name ?? 'Unknown test case';
    const stepNumber = Number(this.currentContext.stepIndex ?? 0) + 1; // Convert to 1-based index
    const stepInfo = `Test Case: "${testCaseName}" (Step ${stepNumber})`;
    trace(2, f, stepInfo); // Include function name in trace

    if (!isDeepEqual) {
      output(`\n${stepInfo}`); // Always show on failure
      trace(1, f + 'expected', expected);
      trace(1, f + 'actual', actual);
      try {
        // DOES NOT SEEM TO WORK IN THIS ORDER: assert.deepStrictEqual(actual, expected);
        deepStrictEqual(actual, expected);
      } catch (e) {
        trace(1, f + 'full-result:', this.currentContext.result);
        trace(2, f, e.message);
        output(`\nError: ${e.message}`);
        exit(1);
      }
    }
  }

  // assertions:
  // - result.statuscode ShouldEqual 200
  // - result.statuscode MustEqual 200
  // - result.body ShouldContainSubstring "success":true
  // - result.body ShouldContainSubstring "pnm":"M1909u-{{.one.user}}"
  // - result.bodyjson ShouldContainKey pushHandle
  // - result.timeseconds ShouldBeLessThan 1

  assertions(list) {
    const f = 'Ey.assertions:';
    if (list == null || list.length === 0) return; // There was no step.assertions
    list.forEach((line) => {
      // Expect word-word<dot>word-word... <space> <Should | Must> <compare-type-function> <space> <value-to-compare>
      const m = line.match(/^([_a-zA-Z][_a-zA-Z0-9.-]*) (Must|Should)([a-zA-Z]+) (.+)$/);
      if (!m) throw new Error(`${f} this assertion looks broken... (${line})`);
      trace(6, f, { line, m });
      const [all, leftSpec, shouldOrMust, compare, rightRaw] = m;
      const left = this._mapVar(leftSpec.split('.'));
      const rightExpanded = this._expand({ rightRaw }).rightRaw;
      const right = rightExpanded.match(/^[1-9][0-9]*$/) ? Number(rightExpanded) : rightExpanded;
      const valid = this._compare(compare, left, right);
      if (!valid) trace(0, f + 'FAILED...', { line, compare, left, right });
      if (!valid && shouldOrMust === 'Must') throw new Error(f + ' Must not fail');
    });
  }
  _compare(command, left, right) {
    switch (command) {
      case 'Equal':
        if (typeof left === 'boolean' && typeof right !== 'boolean') {
          return left === (right === 'true' ? true : right === 'false' ? false : null);
        }
        return left === right;
      case 'ContainSubstring':
        return left.includes(right);
      case 'BeLessThan':
        return left < right;
      case 'ContainKey':
        return !!left && left.constructor === Object && left.hasOwnProperty(right);
      case 'Equal':
        return left === right;
      default:
        throw new Error(f + ' Unknown command in assertion: ' + command);
    }
  }

  // variables: aNewVar: '{{.result.body.hashVal}}'
  variables(spec) {
    const f = 'Ey.variables:';
    trace(1, f, { spec });
    const newVars = this._expand(spec);
    trace(3, f, { newVars });
    Object.assign(this.vars, this._expand(spec)); // this.vars will be copied into each context
  }
}
const onlySkipObject = (stuff) => {
  let only = {};
  let nonSkips = {};
  for (let k in stuff) {
    const thing = stuff[k];
    if (thing.skip === true) continue;
    nonSkips[k] = thing;
    if (thing.only === true) only[k] = thing;
  }
  return Object.keys(only).length === 0 ? nonSkips : only;
};

const onlySkipArray = (stuff) => {
  let only = [];
  let nonSkips = [];
  for (let thing of stuff) {
    if (thing?.skip === true) continue;
    nonSkips.push(thing);
    if (thing?.only === true) only.push(thing);
  }
  return only.length === 0 ? nonSkips : only;
};

const runIt = async (inputVars, modules) => {
  await new Promise((resolve) => setTimeout(resolve, apiServerDelayMs));
  for (let fileKey in onlySkipObject(modules)) {
    const e2e = new Ey({ ...inputVars }); // Each module runs a separate e2e instance
    await e2e.module(fileKey, modules[fileKey]); // Loaded above as yaml
  }
};

// Args processing
const apiServerDelaySeconds = (value, _previous) => (apiServerDelayMs = parseInt(value) * 1000);
const increaseVerbosity = (_value, previous) => previous + 1;
const collect = (value, previous) => previous.concat([value]);
const parseVars = (value, previous) => {
  const m = value.match(/([_a-zA-Z][_a-zA-Z0-9]*)=(.*)/);
  if (!m) throw new Error('Bad variableSpec: ' + value);
  previous[m[1]] = m[2];
  return previous;
};
// Start up logic
const { Command } = require('commander');
const { exit } = require('process');
const testIt = new Command();
// TODO ENV...   .addOption(new Option('-p, --port <number>', 'port number').env('PORT'))
testIt.name('e2eyaml').description('Venom-like e2e testing using yaml files').version('2.0.0');

testIt
  .command('start')
  .description('start e2e yaml tests')
  .argument('<file...>', 'yaml suites to run')
  .option('--var <spec>', "--var some='this thing' --var s2=other", parseVars, {})
  .option('--var-from-file <file>', 'Specify var files', collect, [])
  .option('-v, --verbose', 'verbosity level (e.g. -vv is 2)', increaseVerbosity, 0)
  .option('-d, --delay <value>', 'Delay to allow api-server to start', apiServerDelaySeconds, 0)
  .action((fileList, options) => {
    verbose = options.verbose;
    trace(1, 'TestIt', { fileList, options }, true);
    // Collect vars from --var-from-file and --var
    allVars = {};
    globSync(options.varFromFile).forEach((file) => Object.assign(allVars, req(file)));
    Object.assign(allVars, options.var); // Merge in cmdline vars last to override anything in files
    trace(3, 'TestIt', { allVars }, true);

    // Run each 'fileList'
    const modules = {};
    globSync(fileList).forEach((file) => (modules[file] = req('./' + file)));
    trace(2, 'TestIt', Object.keys(modules));
    trace(4, 'TestIt', modules, true);
    runIt(allVars, modules).catch((e) => {
      console.log('e2eyaml:FATAL', e, e.stack);
    });
  });

testIt.parse();
