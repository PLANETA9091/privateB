// (v0.253.0) THE HAZARD-DEFER STEER: pickOreTarget's hazard band - the approach
// side's debt to the shared HazardLedger. run36335496659 measured 15/15 deaths
// in one strip (z 384..426) while the ledger held 24 live fleet-wide death spots
// and the steer election never read it: the flee/dig/wet-trip sides honor the
// ledger, the APPROACH side walked bots deficit-first INTO the band (F13 drowned
// on its 5th consecutive relog there). The contract under test:
//   - a candidate inside the band loses to EVERY clean candidate (the band ranks
//     above the tier law - a death is a cost class the deficit cannot repay)
//   - NOT excluded: no clean candidate = the best near-hazard one still elects
//     (the tail keeps the option; the ledger's TTL decays the danger)
//   - hzHeld carries the best displaced near-hazard candidate (the decode reads
//     the defer's cost directly); the tail elect carries hz:true
//   - absent/throwing/junk reader reads NO gate (the read never breaks the
//     election); geometry gates (yBand/cross/reach/skip) still own the filter
//     first - a cell the geometry refused never reads the ledger.
import assert from 'node:assert/strict'
import { pickOreTarget } from '../../src/fleet/oresteer.mjs'

const FROM = { x: 100, y: 50, z: 100 }
const pos = (x, y, z) => ({ x, y, z })
// the reader shape mirrors HazardLedger.near: record|null
const hzAt = spot => p => (Math.abs(p.x - spot.x) <= 4 && Math.abs(p.z - spot.z) <= 4 && Math.abs(p.y - spot.y) <= 8 ? { hazard: {}, d: 1 } : null)

// 1. THE CORE SHAPE: a clean coal beats a near-hazard iron - the band outranks
//    the tier law, and hzHeld carries the displaced vein verbatim.
{
  const t = pickOreTarget({
    candidates: [
      { name: 'iron_ore', pos: pos(110, 50, 100) }, // d=10, near the death spot
      { name: 'coal_ore', pos: pos(100, 50, 120) } // d=20, clean
    ],
    from: FROM,
    priorities: ['iron_ore', 'coal_ore'],
    hazardNear: hzAt(pos(110, 50, 100))
  })
  assert.ok(t, 'a target is chosen')
  assert.equal(t.name, 'coal_ore', 'the clean band outranks the tier law')
  assert.equal(t.hz, false, 'the elected candidate reads clean')
  assert.ok(t.hzHeld, 'the displaced vein is named')
  assert.equal(t.hzHeld.name, 'iron_ore', 'the held candidate keeps its name')
  assert.equal(t.hzHeld.dist, 10, 'the held candidate keeps its distance')
}

// 2. THE TAIL KEEPS THE OPTION: every candidate near a hazard = the best of the
//    band still elects (tier law inside the band), hz:true, hzHeld null.
{
  const t = pickOreTarget({
    candidates: [
      { name: 'coal_ore', pos: pos(102, 50, 106) },
      { name: 'iron_ore', pos: pos(106, 50, 102) }
    ],
    from: FROM,
    priorities: ['iron_ore', 'coal_ore'],
    hazardNear: hzAt(pos(104, 50, 104)) // a spot covering BOTH cells
  })
  assert.ok(t, 'the tail elects')
  assert.equal(t.name, 'iron_ore', 'the tier law stands inside the band')
  assert.equal(t.hz, true, 'the tail elect names its hazard band')
  assert.equal(t.hzHeld, null, 'nothing was displaced - no hold to read')
}

// 3. THE LEGACY SHAPE: no hazardNear = the election is byte-for-byte legacy
//    (the tier law leads, hz:false, hzHeld:null - the absent gate reads nothing).
{
  const t = pickOreTarget({
    candidates: [
      { name: 'coal_ore', pos: pos(100, 50, 120) },
      { name: 'iron_ore', pos: pos(110, 50, 100) }
    ],
    from: FROM,
    priorities: ['iron_ore', 'coal_ore']
  })
  assert.ok(t, 'a target is chosen')
  assert.equal(t.name, 'iron_ore', 'the tier law leads without the gate')
  assert.equal(t.hz, false, 'no gate reads clean')
  assert.equal(t.hzHeld, null, 'no gate holds nothing')
}

// 4. THE THROWING READER: a broken ledger read must never break the election -
//    the candidate reads no gate and the legacy winner stands.
{
  const t = pickOreTarget({
    candidates: [{ name: 'iron_ore', pos: pos(110, 50, 100) }, { name: 'coal_ore', pos: pos(100, 50, 120) }],
    from: FROM,
    priorities: ['iron_ore', 'coal_ore'],
    hazardNear: () => { throw new Error('the ledger lies') }
  })
  assert.ok(t, 'the election survives the throw')
  assert.equal(t.name, 'iron_ore', 'the throw reads no gate - the tier law stands')
  assert.equal(t.hz, false, 'the thrown read is not a band')
}

// 5. THE GEOMETRY GATES OWN THE FILTER FIRST: a candidate the cross tolerance
//    refused never reaches the hazard read - the band cannot resurrect it.
{
  let reads = 0
  const t = pickOreTarget({
    candidates: [{ name: 'iron_ore', pos: pos(110, 50, 130) }], // cross=30 > 4
    from: FROM,
    priorities: ['iron_ore'],
    hazardNear: p => { reads++; return hzAt(pos(110, 50, 130))(p) }
  })
  assert.equal(t, null, 'the geometry refusal stands')
  assert.equal(reads, 0, 'the refused cell never read the ledger')
}

// 6. THE BAND IS SURGICAL: a vein 5+ blocks outside the spot's radius reads
//    clean - the gate defers the death cell, not the neighborhood.
{
  const t = pickOreTarget({
    candidates: [{ name: 'iron_ore', pos: pos(112, 50, 100) }], // dx=5 from the spot, on-axis
    from: FROM,
    priorities: ['iron_ore'],
    hazardNear: hzAt(pos(117, 50, 100))
  })
  assert.ok(t, 'the outside cell elects')
  assert.equal(t.hz, false, 'outside the band reads clean')
  assert.equal(t.hzHeld, null, 'nothing held')
}

// 7. THE POS ROUNDING: the reader receives integers (the ledger's keys are
//    block cells - Math.round owns the float pos).
{
  let seen = null
  pickOreTarget({
    candidates: [{ name: 'iron_ore', pos: pos(110.4, 50.6, 99.5) }],
    from: FROM,
    priorities: ['iron_ore'],
    hazardNear: p => { seen = p; return null }
  })
  assert.ok(seen, 'the reader was called')
  assert.deepEqual(seen, { x: 110, y: 51, z: 100 }, 'the pos arrives rounded')
}

// 8. THE HOLD CARRIES THE BEST DISPLACED: two near-hazard candidates - the
//    better one by the tier law is the one the hold names.
{
  const t = pickOreTarget({
    candidates: [
      { name: 'coal_ore', pos: pos(112, 50, 100) }, // d=12, near, low tier
      { name: 'iron_ore', pos: pos(110, 50, 100) }, // d=10, near, high tier
      { name: 'coal_ore', pos: pos(100, 50, 120) } // d=20, clean
    ],
    from: FROM,
    priorities: ['iron_ore', 'coal_ore'],
    hazardNear: hzAt(pos(111, 50, 100)) // a spot covering the two on-axis cells
  })
  assert.equal(t.name, 'coal_ore', 'the clean band leads')
  assert.equal(t.hzHeld.name, 'iron_ore', 'the hold names the BEST displaced, not the first')
  assert.equal(t.hzHeld.dist, 10, 'the hold carries the best displaced distance')
}

// 9. THE JUNK FAMILY: null call, missing candidates, junk reader returns - the
//    election either stands legacy or reads no gate, never throws.
{
  assert.equal(pickOreTarget(null), null, 'the null call refuses')
  assert.equal(pickOreTarget({ candidates: null, from: FROM }), null, 'no candidates refuses')
  const t = pickOreTarget({
    candidates: [{ name: 'iron_ore', pos: pos(110, 50, 100) }],
    from: FROM,
    priorities: ['iron_ore'],
    hazardNear: 'not-a-function'
  })
  assert.ok(t, 'a junk reader is no reader')
  assert.equal(t.hz, false, 'the junk reader reads no gate')
}

// 10. THE SKIP SET STILL OWNS: a held candidate the bot already failed stays
//     out (the band never resurrects a burned wall).
{
  const t = pickOreTarget({
    candidates: [
      { name: 'iron_ore', pos: pos(110, 50, 100) },
      { name: 'coal_ore', pos: pos(100, 50, 120) }
    ],
    from: FROM,
    priorities: ['iron_ore', 'coal_ore'],
    skip: new Set(['110,50,100']),
    hazardNear: hzAt(pos(105, 50, 100))
  })
  assert.ok(t, 'the clean elects')
  assert.equal(t.hzHeld, null, 'the skipped near-hazard cell never joins the band')
}
