**Framework and library idioms.** Follow the conventions of whatever framework or library a
solution is built on rather than working against its grain. A deprecated method or superseded
pattern on something already in the project is the same training-data-staleness risk as choosing
an outdated dependency — check for a current recommended approach rather than trusting what you
recall. If using a library feels awkward — workarounds, casting past its types, undocumented
internals — treat that as a signal it's misapplied, and check the intended usage before pushing
further into the workaround.
