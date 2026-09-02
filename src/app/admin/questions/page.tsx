import { getQuestionBankBreakdown, getQuestionReports } from '../actions';
import QuestionsAdmin from './QuestionsAdmin';

export default async function AdminQuestionsPage() {
  const [breakdown, reports] = await Promise.all([
    getQuestionBankBreakdown(),
    getQuestionReports(),
  ]);
  return <QuestionsAdmin initialBreakdown={breakdown} initialReports={reports} />;
}
