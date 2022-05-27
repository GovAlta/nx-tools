import styled from 'styled-components';

interface PagePros {
  ready?: boolean;
}

const Page = styled.div`
  display: ${(props: PagePros) => (props.ready === true || props.ready === undefined ? 'flex' : 'none')};
  flex-direction: column;
  @media (min-width: 1024px) {
    flex-direction: row;
  }
`;

const Main = styled.main`
  width: 100%;

  h1:first-child,
  h2:first-child,
  h3:first-child {
    margin-top: 0;
  }

  /* Base header margins */
  h1,
  h2,
  h3,
  h4 {
    margin-bottom: 1rem;
  }

  /* Font sizes */
  h1 {
    font-size: var(--fs-2xl);
    font-weight: var(--fw-light);
  }
  h2 {
    font-size: var(--fs-xl);
  }
  h3 {
    font-size: var(--fs-lg);
  }

  /* Set top margin to subsequent headers */
  h1 + h2,
  h1 + h3,
  h1 + h4,
  h2 + h3,
  h2 + h4,
  h3 + h4 {
    margin-top: 2rem;
  }

  // goa-core has padding at the top rather than the bottom
  p {
    margin-top: 0 !important;
    margin-bottom: 1rem;
    font-size: var(--fs-base);
  }

  // default padding is way too much
  ul {
    padding-left: 1rem;
  }

  hr {
    border-width: 0;
    border-top: 1px solid #ccc;
    margin: 2rem 0;
  }

  // prevent too much bottom space when a header immediately follows an <hr>
  hr + h1,
  hr + h2,
  hr + h3 {
    margin-top: 0;
  }

  // if content is sectioned off let's give it some padding
  section {
    padding: 1rem 0;
  }
`;

const Aside = styled.aside`
  padding: 0.5rem 0;
  .copy-url {
    font-size: var(--fs-sm);
    background-color: var(--color-gray-100);
    border: 1px solid var(--color-gray-300);
    border-radius: 1px;
    padding: 0.25rem;
    margin-bottom: 1rem;
    margin-top: 0.5rem;
    line-height: normal;
  }
  @media (min-width: 1280px) {
    flex: 0 0 380px;
    padding-left: 2rem;
  }

  @media (min-width: 1024px) and (max-width: 1279px) {
    flex: 0 0 269px;
    padding-left: 2rem;
  }

  a {
    display: inline-block;
  }

  h1,
  h2,
  h3,
  h4,
  h5 {
    margin-top: 1rem;
    line-height: normal;
    font-weight: var(--fw-bold);
  }

  h1:first-child,
  h2:first-child,
  h3:first-child,
  h4:first-child,
  h5:first-child {
    margin-top: 0;
  }

  /* Font sizes */
  h1 {
    font-size: calc(0.9 * var(--fs-2xl));
  }
  h2 {
    font-size: calc(0.9 * var(--fs-xl));
  }
  h3 {
    font-size: calc(0.9 * var(--fs-lg));
  }

  p {
    margin: 0 0 1rem !important;
  }
`;

export { Page, Main, Aside };
